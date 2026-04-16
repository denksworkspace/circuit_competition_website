// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";
import { ensureCommandRolesSchema } from "./_roles.js";
import { parseBody, rejectMethod } from "./_lib/http.js";
import { ensureCommandUploadSettingsSchema } from "./_lib/commandUploadSettings.js";
import { ensurePointsStatusConstraint } from "./_lib/pointsStatus.js";
import { ensureUploadQueueSchema, normalizeUploadRequestRow, normalizeUploadRequestFileRow } from "./_lib/uploadQueue.js";
import {
    finalizeUploadRequestPareto,
    getCommandByAuthKey,
    isManualApplyCandidate,
    loadUploadRequestSnapshot,
    refreshUploadRequestCounters,
    withUploadRequestLock,
} from "./_lib/uploadQueueOps.js";
import { applyUploadQueueFileRow } from "./_lib/uploadQueueProcessing.js";
import { downloadQueueFileText } from "./_lib/queueS3.js";
import { syncParetoFilenameCsvs } from "./_lib/paretoFilenameSync.js";
import { setVerifyProgress } from "./_lib/verifyProgress.js";

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["POST"])) return;
    const body = parseBody(req);
    const authKey = String(body?.authKey || "").trim();
    const requestId = String(body?.requestId || "").trim();
    const progressToken = String(body?.progressToken || "").trim();
    const fileIds = Array.isArray(body?.fileIds) ? body.fileIds.map((id) => String(id || "").trim()).filter(Boolean) : [];
    if (!authKey) {
        res.status(401).json({ error: "Missing auth key." });
        return;
    }
    if (!requestId) {
        res.status(400).json({ error: "Missing requestId." });
        return;
    }

    await ensureCommandRolesSchema();
    await ensureCommandUploadSettingsSchema();
    await ensurePointsStatusConstraint();
    await ensureUploadQueueSchema();

    const command = await getCommandByAuthKey(authKey);
    if (!command) {
        res.status(401).json({ error: "Invalid auth key." });
        return;
    }

    await withUploadRequestLock(requestId, async () => {
        const reqRes = await sql`
      select
        id,
        command_id,
        status,
        selected_parser,
        selected_checker,
        parser_timeout_seconds,
        checker_timeout_seconds,
        description,
        manual_synthesis,
        auto_manual_window,
        total_count,
        done_count,
        verified_count
      from public.upload_requests
      where id = ${requestId}
        and command_id = ${command.id}
      limit 1
    `;
        if (reqRes.rows.length === 0) {
            res.status(404).json({ error: "Upload request not found." });
            return;
        }
        const requestRow = normalizeUploadRequestRow(reqRes.rows[0]);

        const filesRes = await sql`
      select
        id,
        order_index,
        original_file_name,
        queue_file_key,
        file_size,
        verdict,
        can_apply,
        default_checked,
        manual_review_required,
        applied,
        checker_version,
        parsed_benchmark,
        parsed_delay,
        parsed_area,
        content_hash
      from public.upload_request_files
      where request_id = ${requestId}
        and not applied
        and can_apply
      order by order_index asc
    `;
        const rows = filesRes.rows.map(normalizeUploadRequestFileRow);
        const savedPoints = [];
        const errors = [];
        const selectedIds = new Set(fileIds);
        const unresolvedSelectedIds = new Set(fileIds);
        const statusesToSync = new Set();
        const rowsToSave = rows.filter((row) => !isManualApplyCandidate(row) || selectedIds.has(row.id));
        const rowsToDrop = rows.filter((row) => isManualApplyCandidate(row) && !selectedIds.has(row.id));
        const availableRowIds = new Set(rows.map((row) => row.id));
        for (const row of rowsToDrop) {
            await sql`
          update public.upload_request_files
          set can_apply = false,
              default_checked = false,
              manual_review_required = false,
          updated_at = now()
          where id = ${row.id}
        `;
        }
        const totalCount = rowsToSave.length + Array.from(selectedIds).filter((id) => !availableRowIds.has(id)).length;
        let doneCount = 0;
        const report = (patch = {}) => setVerifyProgress(progressToken, {
        status: "apply",
        done: false,
        error: null,
        doneCount,
        totalCount,
        currentFileName: "",
        ...patch,
        });
        report();

        for (const row of rowsToSave) {
        if (selectedIds.has(row.id)) {
            unresolvedSelectedIds.delete(row.id);
        }
        report({ currentFileName: String(row.originalFileName || "") });
        const downloaded = await downloadQueueFileText(row.queueFileKey);
        if (!downloaded.ok) {
            errors.push(`file=${row.originalFileName}; ${downloaded.reason || "Failed to download queue file."}`);
            doneCount += 1;
            report({ doneCount });
            continue;
        }
        const applied = await applyUploadQueueFileRow({
            command,
            requestRow,
            fileRow: row,
            circuitText: downloaded.circuitText,
        });
        if (applied.duplicate) {
            await sql`
              update public.upload_request_files
              set verdict = 'duplicate',
                  verdict_reason = ${String(applied.error || "Identical point already exists.")},
                  can_apply = false,
                  default_checked = false,
                  manual_review_required = false,
                  updated_at = now()
              where id = ${row.id}
            `;
            doneCount += 1;
            report({ doneCount });
            continue;
        }
        if (!applied.ok) {
            errors.push(`file=${row.originalFileName}; ${applied.error || "Failed to apply file."}`);
            doneCount += 1;
            report({ doneCount });
            continue;
        }
        savedPoints.push(applied.point);
        statusesToSync.add(String(applied?.point?.status || "").trim().toLowerCase());
        await sql`
          update public.upload_request_files
          set applied = true,
              point_id = ${applied.pointId},
              final_file_name = ${applied.finalFileName},
              can_apply = false,
              default_checked = false,
              manual_review_required = false,
              updated_at = now()
          where id = ${row.id}
        `;
        doneCount += 1;
        report({ doneCount });
        }

        for (const unresolvedId of unresolvedSelectedIds) {
        errors.push(`file=${unresolvedId}; File not found or not available for apply.`);
        doneCount += 1;
        report({ doneCount });
        }

        const counters = await refreshUploadRequestCounters(requestId);
        const pendingCount = Number(counters?.pendingCount);
        if (Number.isFinite(pendingCount) && pendingCount <= 0) {
            await finalizeUploadRequestPareto({
            requestId,
            commandId: command.id,
            commandName: command.name,
            });
        }
        try {
            await syncParetoFilenameCsvs({ statuses: Array.from(statusesToSync) });
        } catch {
            report({ done: true, doneCount, error: "Upload apply completed, but pareto filename CSV sync failed." });
            res.status(500).json({
                error: "Upload apply completed, but pareto filename CSV sync failed.",
                savedPoints,
                errors,
            });
            return;
        }
        report({ done: true, doneCount, currentFileName: "" });
        const snapshot = await loadUploadRequestSnapshot({
            requestId,
            commandId: command.id,
            includeFiles: true,
            commandName: command.name,
            paretoMode: "final_only",
        });
        res.status(200).json({
            ...snapshot,
            savedPoints,
            errors,
        });
    });
}

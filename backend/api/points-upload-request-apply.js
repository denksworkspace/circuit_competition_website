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
    loadUploadRequestSnapshot,
    refreshUploadRequestCounters,
} from "./_lib/uploadQueueOps.js";
import { applyUploadQueueFileRow } from "./_lib/uploadQueueProcessing.js";
import { downloadQueueFileText } from "./_lib/queueS3.js";
import { syncParetoFilenameCsvs } from "./_lib/paretoFilenameSync.js";

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["POST"])) return;
    const body = parseBody(req);
    const authKey = String(body?.authKey || "").trim();
    const requestId = String(body?.requestId || "").trim();
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
        total_count,
        done_count,
        verified_count
      from upload_requests
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
        applied,
        checker_version,
        parsed_benchmark,
        parsed_delay,
        parsed_area
      from upload_request_files
      where request_id = ${requestId}
        and not applied
        and can_apply
      order by order_index asc
    `;
    const rows = filesRes.rows.map(normalizeUploadRequestFileRow);
    const savedPoints = [];
    const errors = [];
    const selectedIds = new Set(fileIds);
    const statusesToSync = new Set();

    for (const row of rows) {
        if (!selectedIds.has(row.id)) {
            await sql`
              update upload_request_files
              set can_apply = false,
                  default_checked = false,
                  updated_at = now()
              where id = ${row.id}
            `;
            continue;
        }
        const downloaded = await downloadQueueFileText(row.queueFileKey);
        if (!downloaded.ok) {
            errors.push(`file=${row.originalFileName}; ${downloaded.reason || "Failed to download queue file."}`);
            continue;
        }
        const applied = await applyUploadQueueFileRow({
            command,
            requestRow,
            fileRow: row,
            circuitText: downloaded.circuitText,
        });
        if (!applied.ok) {
            errors.push(`file=${row.originalFileName}; ${applied.error || "Failed to apply file."}`);
            continue;
        }
        savedPoints.push(applied.point);
        statusesToSync.add(String(applied?.point?.status || "").trim().toLowerCase());
        await sql`
          update upload_request_files
          set applied = true,
              point_id = ${applied.pointId},
              final_file_name = ${applied.finalFileName},
              can_apply = false,
              default_checked = false,
              updated_at = now()
          where id = ${row.id}
        `;
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
        res.status(500).json({
            error: "Upload apply completed, but pareto filename CSV sync failed.",
            savedPoints,
            errors,
        });
        return;
    }
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
}

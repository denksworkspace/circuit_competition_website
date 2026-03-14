// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";
import { ensureCommandRolesSchema } from "./_roles.js";
import { parseBody, rejectMethod } from "./_lib/http.js";
import { ensureCommandUploadSettingsSchema } from "./_lib/commandUploadSettings.js";
import { ensurePointsStatusConstraint } from "./_lib/pointsStatus.js";
import {
    FILE_PROCESS_STATE_NON_PROCESSED,
    FILE_PROCESS_STATE_PROCESSING,
    FILE_VERDICT_FAILED,
    FILE_VERDICT_NON_PROCESSED,
    REQUEST_STATUS_COMPLETED,
    REQUEST_STATUS_FAILED,
    REQUEST_STATUS_FREEZED,
    REQUEST_STATUS_INTERRUPTED,
    REQUEST_STATUS_PROCESSING,
    REQUEST_STATUS_WAITING_MANUAL_VERDICT,
    ensureUploadQueueSchema,
} from "./_lib/uploadQueue.js";
import { isRetryableDbError } from "./_lib/dbRetry.js";
import {
    findNextPendingUploadFile,
    getCommandByAuthKey,
    loadUploadRequestSnapshot,
    markRemainingAsNonProcessed,
    refreshUploadRequestCounters,
} from "./_lib/uploadQueueOps.js";
import { deleteQueueObject, downloadQueueFileText } from "./_lib/queueS3.js";
import { processUploadQueueFile } from "./_lib/uploadQueueProcessing.js";
import { checkMaintenanceBlock } from "./_lib/maintenanceMode.js";

const TERMINAL = new Set([REQUEST_STATUS_COMPLETED, REQUEST_STATUS_INTERRUPTED, REQUEST_STATUS_FAILED, "closed"]);

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["POST"])) return;
    const body = parseBody(req);
    const authKey = String(body?.authKey || "").trim();
    const requestId = String(body?.requestId || "").trim();
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

    const initialSnapshot = await loadUploadRequestSnapshot({
        requestId,
        commandId: command.id,
        includeFiles: false,
    });
    if (!initialSnapshot) {
        res.status(404).json({ error: "Upload request not found." });
        return;
    }
    const initialRequest = initialSnapshot.request;
    const initialStatus = String(initialRequest.status || "").toLowerCase();
    if (TERMINAL.has(initialStatus) || initialStatus === REQUEST_STATUS_WAITING_MANUAL_VERDICT) {
        const ready = await loadUploadRequestSnapshot({ requestId, commandId: command.id, includeFiles: true });
        res.status(200).json(ready);
        return;
    }
    const maintenance = await checkMaintenanceBlock({
        ...req,
        body,
        urlPath: "/api/points-upload-request-run",
    });
    if (maintenance.blocked) {
        await sql`
          update upload_requests
          set status = ${REQUEST_STATUS_FREEZED},
              error = ${String(maintenance.state?.message || "Technical maintenance is in progress.")},
              finished_at = null,
              current_phase = '',
              current_file_name = '',
              updated_at = now()
          where id = ${requestId}
        `;
        const ready = await loadUploadRequestSnapshot({ requestId, commandId: command.id, includeFiles: true });
        res.status(200).json(ready);
        return;
    }

    if (initialRequest.stopRequested) {
        await markRemainingAsNonProcessed(requestId);
        const ready = await loadUploadRequestSnapshot({ requestId, commandId: command.id, includeFiles: true });
        res.status(200).json(ready);
        return;
    }

    const nextFile = await findNextPendingUploadFile(requestId);
    if (!nextFile) {
        await refreshUploadRequestCounters(requestId);
        await sql`
          update upload_requests
          set current_phase = '',
              current_file_name = '',
              updated_at = now()
          where id = ${requestId}
        `;
        const ready = await loadUploadRequestSnapshot({ requestId, commandId: command.id, includeFiles: true });
        res.status(200).json(ready);
        return;
    }

    await sql`
      update upload_request_files
      set process_state = ${FILE_PROCESS_STATE_PROCESSING},
          updated_at = now()
      where id = ${nextFile.id}
    `;
    await sql`
      update upload_requests
      set status = ${REQUEST_STATUS_PROCESSING},
          current_file_name = ${nextFile.originalFileName},
          current_phase = 'download',
          updated_at = now()
      where id = ${requestId}
    `;

    const phaseReporter = async (phase) => {
        await sql`
          update upload_requests
          set current_phase = ${String(phase || "")},
              updated_at = now()
          where id = ${requestId}
        `;
    };

    const downloaded = await downloadQueueFileText(nextFile.queueFileKey);
    if (!downloaded.ok) {
        await sql`
          update upload_request_files
          set process_state = 'processed',
              verdict = ${FILE_VERDICT_FAILED},
              verdict_reason = ${String(downloaded.reason || "Failed to download queue file.")},
              can_apply = true,
              default_checked = true,
              processed_at = now(),
              updated_at = now()
          where id = ${nextFile.id}
        `;
        await refreshUploadRequestCounters(requestId);
        await sql`
          update upload_requests
          set current_phase = '',
              current_file_name = '',
              updated_at = now()
          where id = ${requestId}
        `;
        const ready = await loadUploadRequestSnapshot({ requestId, commandId: command.id, includeFiles: true });
        res.status(200).json(ready);
        return;
    }

    try {
        const processed = await processUploadQueueFile({
            fileRow: nextFile,
            requestRow: initialRequest,
            command,
            circuitText: downloaded.circuitText,
            reportPhase: (phase) => {
                void phaseReporter(phase);
            },
        });
        await sql`
          update upload_request_files
          set process_state = ${processed.processState},
              verdict = ${processed.verdict},
              verdict_reason = ${processed.verdictReason},
              can_apply = ${processed.canApply},
              default_checked = ${processed.defaultChecked},
              applied = ${processed.applied},
              point_id = ${processed.pointId},
              checker_version = ${processed.checkerVersion},
              parsed_benchmark = ${processed.parsedBenchmark},
              parsed_delay = ${processed.parsedDelay},
              parsed_area = ${processed.parsedArea},
              final_file_name = ${processed.finalFileName},
              processed_at = now(),
              updated_at = now()
          where id = ${nextFile.id}
        `;
        if (processed.applied) {
            await deleteQueueObject(nextFile.queueFileKey);
        }
        await refreshUploadRequestCounters(requestId);
    } catch (error) {
        if (isRetryableDbError(error)) {
            await sql`
              update upload_request_files
              set process_state = ${FILE_PROCESS_STATE_NON_PROCESSED},
                  verdict = ${FILE_VERDICT_NON_PROCESSED},
                  verdict_reason = ${String(error?.message || "Skipped due to temporary database connectivity issue.")},
                  can_apply = false,
                  default_checked = false,
                  processed_at = now(),
                  updated_at = now()
              where id = ${nextFile.id}
            `;
            await refreshUploadRequestCounters(requestId);
            await sql`
              update upload_requests
              set error = ${String(error?.message || "Temporary database connectivity issue; file skipped.")},
                  current_phase = '',
                  current_file_name = '',
                  updated_at = now()
              where id = ${requestId}
            `;
            const ready = await loadUploadRequestSnapshot({ requestId, commandId: command.id, includeFiles: true });
            res.status(200).json(ready);
            return;
        }
        await sql`
          update upload_request_files
          set process_state = 'processed',
              verdict = ${FILE_VERDICT_FAILED},
              verdict_reason = ${String(error?.message || "Failed to process queue file.")},
              can_apply = false,
              default_checked = false,
              processed_at = now(),
              updated_at = now()
          where id = ${nextFile.id}
        `;
        await refreshUploadRequestCounters(requestId);
        await sql`
          update upload_requests
          set status = ${REQUEST_STATUS_FAILED},
              error = ${String(error?.message || "Failed to process upload request.")},
              finished_at = coalesce(finished_at, now()),
              current_phase = '',
              current_file_name = '',
              updated_at = now()
          where id = ${requestId}
        `;
        const ready = await loadUploadRequestSnapshot({ requestId, commandId: command.id, includeFiles: true });
        res.status(200).json(ready);
        return;
    }

    const postRunSnapshot = await loadUploadRequestSnapshot({
        requestId,
        commandId: command.id,
        includeFiles: false,
    });
    if (postRunSnapshot?.request?.stopRequested) {
        await markRemainingAsNonProcessed(requestId);
    } else {
        const pending = await findNextPendingUploadFile(requestId);
        if (!pending) {
            await refreshUploadRequestCounters(requestId);
            await sql`
              update upload_requests
              set current_phase = '',
                  current_file_name = '',
                  updated_at = now()
              where id = ${requestId}
            `;
        } else {
            await sql`
              update upload_requests
              set current_phase = '',
                  current_file_name = '',
                  updated_at = now()
              where id = ${requestId}
            `;
        }
    }

    const ready = await loadUploadRequestSnapshot({ requestId, commandId: command.id, includeFiles: true });
    res.status(200).json(ready);
}

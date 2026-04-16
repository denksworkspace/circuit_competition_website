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
    normalizeUploadRequestFileRow,
} from "./_lib/uploadQueue.js";
import { isRetryableDbError } from "./_lib/dbRetry.js";
import {
    finalizeUploadRequestPareto,
    findNextPendingUploadFile,
    getCommandByAuthKey,
    isManualApplyCandidate,
    isUploadStopRequested,
    loadUploadRequestSnapshot,
    markRemainingAsNonProcessed,
    refreshUploadRequestCounters,
    withUploadRequestLock,
} from "./_lib/uploadQueueOps.js";
import { downloadQueueFileText } from "./_lib/queueS3.js";
import { applyUploadQueueFileRow, processUploadQueueFile } from "./_lib/uploadQueueProcessing.js";
import { checkMaintenanceBlock } from "./_lib/maintenanceMode.js";
import { syncParetoFilenameCsvs } from "./_lib/paretoFilenameSync.js";

const TERMINAL = new Set([REQUEST_STATUS_COMPLETED, REQUEST_STATUS_INTERRUPTED, REQUEST_STATUS_FAILED, "closed"]);
const STOP_POLL_MS = Math.max(300, Number(process.env.UPLOAD_QUEUE_STOP_POLL_MS || 1000));

function isAbortLikeError(error) {
    const name = String(error?.name || "").toLowerCase();
    const code = String(error?.code || "").toLowerCase();
    return name === "aborterror" || code === "aborted" || code === "abort_err";
}

function createAbortError() {
    const error = new Error("Upload request was stopped.");
    error.name = "AbortError";
    return error;
}

function createStopMonitor(requestId) {
    const controller = new AbortController();
    let timer = null;
    let closed = false;
    const pollStopRequested = async () => {
        if (closed || controller.signal.aborted) return;
        try {
            const stopRequested = await isUploadStopRequested(requestId);
            if (stopRequested) {
                controller.abort();
                return;
            }
        } catch {
            // keep trying; transient DB errors should not break active processing
        }
        timer = setTimeout(() => {
            void pollStopRequested();
        }, STOP_POLL_MS);
    };
    void pollStopRequested();
    return {
        signal: controller.signal,
        close() {
            closed = true;
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
        },
    };
}

function shouldIncludeFilesInRunResponse(responseModeRaw) {
    return String(responseModeRaw || "full").trim().toLowerCase() !== "request_only";
}

async function loadRunResponseSnapshot({ requestId, command, includeFiles }) {
    const snapshot = await loadUploadRequestSnapshot({
        requestId,
        commandId: command.id,
        includeFiles,
        commandName: command.name,
        paretoMode: "final_only",
    });
    if (!snapshot) {
        return includeFiles ? { request: null, files: [] } : { request: null };
    }
    if (!includeFiles) {
        return { request: snapshot.request };
    }
    return snapshot;
}

async function finalizeParetoIfCompleted({ requestId, command, counters }) {
    const pendingCount = Number(counters?.pendingCount);
    if (!Number.isFinite(pendingCount) || pendingCount > 0) return;
    await finalizeUploadRequestPareto({
        requestId,
        commandId: command.id,
        commandName: command.name,
    });
}

async function listSavableUploadFiles(requestId) {
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
        parsed_area
      from public.upload_request_files
      where request_id = ${requestId}
        and not applied
        and can_apply
      order by order_index asc
    `;
    return filesRes.rows.map(normalizeUploadRequestFileRow);
}

async function markAutoSkippedRowsClosed(requestId) {
    await sql`
      update public.upload_request_files
      set can_apply = false,
          default_checked = false,
          manual_review_required = false,
          updated_at = now()
      where request_id = ${requestId}
        and not applied
        and can_apply
        and manual_review_required
        and not default_checked
    `;
}

async function saveAutoEligibleRows({
    requestId,
    command,
    requestRow,
    signal,
}) {
    const rows = await listSavableUploadFiles(requestId);
    const rowsToSave = rows.filter((row) => !isManualApplyCandidate(row) || row.defaultChecked);
    const statusesToSync = new Set();

    if (rowsToSave.length > 0) {
        await sql`
          update public.upload_requests
          set current_phase = 'saving',
              current_file_name = '',
              updated_at = now()
          where id = ${requestId}
        `;
    }

    for (const row of rowsToSave) {
        const downloaded = await downloadQueueFileText(row.queueFileKey, { signal });
        if (!downloaded.ok) {
            throw new Error(downloaded.reason || `Failed to download queue file: ${row.originalFileName}`);
        }
        const applied = await applyUploadQueueFileRow({
            command,
            requestRow,
            fileRow: row,
            circuitText: downloaded.circuitText,
            signal,
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
                and not applied
                and point_id is null
            `;
            continue;
        }
        if (!applied.ok) {
            throw new Error(applied.error || `Failed to save point: ${row.originalFileName}`);
        }
        statusesToSync.add(String(applied?.point?.status || "").trim().toLowerCase());
        await sql`
          update public.upload_request_files
          set verdict = coalesce(${String(row?.verdict || "").trim() || null}, verdict),
              applied = true,
              point_id = ${applied.pointId},
              final_file_name = ${applied.finalFileName},
              can_apply = false,
              default_checked = false,
              manual_review_required = false,
              updated_at = now()
          where id = ${row.id}
        `;
    }

    await markAutoSkippedRowsClosed(requestId);
    return { statusesToSync };
}

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["POST"])) return;
    const body = parseBody(req);
    const authKey = String(body?.authKey || "").trim();
    const requestId = String(body?.requestId || "").trim();
    const includeFilesInResponse = shouldIncludeFilesInRunResponse(body?.responseMode);
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
        const initialSnapshot = await loadUploadRequestSnapshot({
            requestId,
            commandId: command.id,
            includeFiles: false,
            commandName: command.name,
        });
        if (!initialSnapshot) {
            res.status(404).json({ error: "Upload request not found." });
            return;
        }
        const initialRequest = initialSnapshot.request;
        const initialStatus = String(initialRequest.status || "").toLowerCase();
        if (TERMINAL.has(initialStatus) || initialStatus === REQUEST_STATUS_WAITING_MANUAL_VERDICT) {
            const ready = await loadRunResponseSnapshot({
                requestId,
                command,
                includeFiles: includeFilesInResponse,
            });
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
          update public.upload_requests
          set status = ${REQUEST_STATUS_FREEZED},
              error = ${String(maintenance.state?.message || "Technical maintenance is in progress.")},
              finished_at = null,
              current_phase = '',
              current_file_name = '',
              updated_at = now()
          where id = ${requestId}
        `;
            const ready = await loadRunResponseSnapshot({
                requestId,
                command,
                includeFiles: includeFilesInResponse,
            });
            res.status(200).json(ready);
            return;
        }

        if (initialRequest.stopRequested) {
            await markRemainingAsNonProcessed(requestId);
            const ready = await loadRunResponseSnapshot({
                requestId,
                command,
                includeFiles: includeFilesInResponse,
            });
            res.status(200).json(ready);
            return;
        }

        const nextFile = await findNextPendingUploadFile(requestId);
        if (!nextFile) {
            try {
                let counters = await refreshUploadRequestCounters(requestId);
                await finalizeParetoIfCompleted({ requestId, command, counters });
                let statusesToSync = new Set();
                if (Number(counters?.pendingCount || 0) <= 0
                    && (Boolean(initialRequest.autoManualWindow) || Number(counters?.manualPendingCount || 0) <= 0)
                    && Number(counters?.savablePendingCount || 0) > 0) {
                    const autoSaved = await saveAutoEligibleRows({
                        requestId,
                        command,
                        requestRow: initialRequest,
                    });
                    statusesToSync = autoSaved.statusesToSync;
                    counters = await refreshUploadRequestCounters(requestId);
                    await finalizeParetoIfCompleted({ requestId, command, counters });
                    if (statusesToSync.size > 0) {
                        await syncParetoFilenameCsvs({ statuses: Array.from(statusesToSync) });
                    }
                }
            } catch (error) {
                await sql`
                  update public.upload_requests
                  set status = ${REQUEST_STATUS_FAILED},
                      error = ${String(error?.message || "Failed to finish upload request.")},
                      finished_at = coalesce(finished_at, now()),
                      current_phase = '',
                      current_file_name = '',
                      updated_at = now()
                  where id = ${requestId}
                `;
                const ready = await loadRunResponseSnapshot({
                    requestId,
                    command,
                    includeFiles: includeFilesInResponse,
                });
                res.status(200).json(ready);
                return;
            }
            await sql`
              update public.upload_requests
              set current_phase = '',
                  current_file_name = '',
                  updated_at = now()
              where id = ${requestId}
            `;
            const ready = await loadRunResponseSnapshot({
                requestId,
                command,
                includeFiles: includeFilesInResponse,
            });
            res.status(200).json(ready);
            return;
        }

        await sql`
      update public.upload_request_files
      set process_state = ${FILE_PROCESS_STATE_PROCESSING},
          updated_at = now()
      where id = ${nextFile.id}
    `;
    await sql`
      update public.upload_requests
      set status = ${REQUEST_STATUS_PROCESSING},
          current_file_name = ${nextFile.originalFileName},
          current_phase = 'download',
          updated_at = now()
      where id = ${requestId}
    `;

    const phaseReporter = async (phase) => {
        await sql`
          update public.upload_requests
          set current_phase = ${String(phase || "")},
              updated_at = now()
          where id = ${requestId}
        `;
    };

        const stopMonitor = createStopMonitor(requestId);
        let refreshedCounters = null;
        let autoSavedStatusesToSync = new Set();
        try {
        const downloaded = await downloadQueueFileText(nextFile.queueFileKey, { signal: stopMonitor.signal });
        if (!downloaded.ok) {
            if (downloaded.aborted || stopMonitor.signal.aborted) {
                throw createAbortError();
            }
            await sql`
              update public.upload_request_files
              set process_state = 'processed',
                  verdict = ${FILE_VERDICT_FAILED},
                  verdict_reason = ${String(downloaded.reason || "Failed to download queue file.")},
                  can_apply = false,
                  default_checked = false,
                  manual_review_required = false,
                  processed_at = now(),
                  updated_at = now()
              where id = ${nextFile.id}
            `;
            refreshedCounters = await refreshUploadRequestCounters(requestId);
            await finalizeParetoIfCompleted({ requestId, command, counters: refreshedCounters });
            await sql`
              update public.upload_requests
              set current_phase = '',
                  current_file_name = '',
                  updated_at = now()
              where id = ${requestId}
            `;
            const ready = await loadRunResponseSnapshot({
                requestId,
                command,
                includeFiles: includeFilesInResponse,
            });
            res.status(200).json(ready);
            return;
        }

            const processed = await processUploadQueueFile({
            fileRow: nextFile,
            requestRow: initialRequest,
            command,
            circuitText: downloaded.circuitText,
            signal: stopMonitor.signal,
            reportPhase: (phase) => {
                void phaseReporter(phase);
            },
        });
            await sql`
          update public.upload_request_files
          set process_state = ${processed.processState},
              verdict = ${processed.verdict},
              verdict_reason = ${processed.verdictReason},
              can_apply = ${processed.canApply},
              default_checked = ${processed.defaultChecked},
              manual_review_required = ${processed.manualReviewRequired},
              applied = ${processed.applied},
              point_id = ${processed.pointId},
              checker_version = ${processed.checkerVersion},
              parsed_benchmark = ${processed.parsedBenchmark},
              parsed_delay = ${processed.parsedDelay},
              parsed_area = ${processed.parsedArea},
              content_hash = ${processed.contentHash},
              final_file_name = ${processed.finalFileName},
              processed_at = now(),
              updated_at = now()
          where id = ${nextFile.id}
        `;
            refreshedCounters = await refreshUploadRequestCounters(requestId);
            await finalizeParetoIfCompleted({ requestId, command, counters: refreshedCounters });
        } catch (error) {
        if (isAbortLikeError(error) || stopMonitor.signal.aborted) {
            await sql`
              update public.upload_request_files
              set process_state = ${FILE_PROCESS_STATE_NON_PROCESSED},
                  verdict = ${FILE_VERDICT_NON_PROCESSED},
                  verdict_reason = ${String(error?.message || "Upload was interrupted by user.")},
                  can_apply = false,
                  default_checked = false,
                  manual_review_required = false,
                  processed_at = now(),
                  updated_at = now()
              where id = ${nextFile.id}
                and lower(coalesce(process_state, '')) = ${FILE_PROCESS_STATE_PROCESSING}
            `;
            await markRemainingAsNonProcessed(requestId, {
                includeProcessing: true,
                reason: "Upload was interrupted by user.",
            });
            await sql`
              update public.upload_requests
              set error = ${String(error?.message || "Upload was interrupted by user.")},
                  current_phase = '',
                  current_file_name = '',
                  updated_at = now()
              where id = ${requestId}
            `;
            const ready = await loadRunResponseSnapshot({
                requestId,
                command,
                includeFiles: includeFilesInResponse,
            });
            res.status(200).json(ready);
            return;
        }
        if (isRetryableDbError(error)) {
            await sql`
              update public.upload_request_files
              set process_state = ${FILE_PROCESS_STATE_NON_PROCESSED},
                  verdict = ${FILE_VERDICT_NON_PROCESSED},
                  verdict_reason = ${String(error?.message || "Skipped due to temporary database connectivity issue.")},
                  can_apply = false,
                  default_checked = false,
                  manual_review_required = false,
                  processed_at = now(),
                  updated_at = now()
              where id = ${nextFile.id}
            `;
            refreshedCounters = await refreshUploadRequestCounters(requestId);
            await finalizeParetoIfCompleted({ requestId, command, counters: refreshedCounters });
            await sql`
              update public.upload_requests
              set error = ${String(error?.message || "Temporary database connectivity issue; file skipped.")},
                  current_phase = '',
                  current_file_name = '',
                  updated_at = now()
              where id = ${requestId}
            `;
            const ready = await loadRunResponseSnapshot({
                requestId,
                command,
                includeFiles: includeFilesInResponse,
            });
            res.status(200).json(ready);
            return;
        }
        await sql`
          update public.upload_request_files
          set process_state = 'processed',
              verdict = ${FILE_VERDICT_FAILED},
              verdict_reason = ${String(error?.message || "Failed to process queue file.")},
              can_apply = false,
              default_checked = false,
              manual_review_required = false,
              processed_at = now(),
              updated_at = now()
          where id = ${nextFile.id}
        `;
        refreshedCounters = await refreshUploadRequestCounters(requestId);
        await sql`
          update public.upload_requests
          set status = ${REQUEST_STATUS_FAILED},
              error = ${String(error?.message || "Failed to process upload request.")},
              finished_at = coalesce(finished_at, now()),
              current_phase = '',
              current_file_name = '',
              updated_at = now()
          where id = ${requestId}
        `;
        await finalizeParetoIfCompleted({ requestId, command, counters: refreshedCounters });
        const ready = await loadRunResponseSnapshot({
            requestId,
            command,
            includeFiles: includeFilesInResponse,
        });
        res.status(200).json(ready);
        return;
        } finally {
            stopMonitor.close();
        }

        try {
            const postRunSnapshot = await loadUploadRequestSnapshot({
            requestId,
            commandId: command.id,
            includeFiles: false,
            commandName: command.name,
            });
            if (postRunSnapshot?.request?.stopRequested) {
                await markRemainingAsNonProcessed(requestId);
            } else {
                const pending = await findNextPendingUploadFile(requestId);
                if (!pending) {
                    if (!refreshedCounters || Number(refreshedCounters.pendingCount || 0) > 0) {
                        refreshedCounters = await refreshUploadRequestCounters(requestId);
                        await finalizeParetoIfCompleted({ requestId, command, counters: refreshedCounters });
                    }
                    if (Number(refreshedCounters?.pendingCount || 0) <= 0
                        && (
                            Boolean(postRunSnapshot?.request?.autoManualWindow ?? initialRequest.autoManualWindow)
                            || Number(refreshedCounters?.manualPendingCount || 0) <= 0
                        )
                        && Number(refreshedCounters?.savablePendingCount || 0) > 0) {
                        const autoSaved = await saveAutoEligibleRows({
                            requestId,
                            command,
                            requestRow: postRunSnapshot?.request || initialRequest,
                        });
                        autoSavedStatusesToSync = autoSaved.statusesToSync;
                        refreshedCounters = await refreshUploadRequestCounters(requestId);
                        await finalizeParetoIfCompleted({ requestId, command, counters: refreshedCounters });
                    }
                    await sql`
                      update public.upload_requests
                      set current_phase = '',
                          current_file_name = '',
                          updated_at = now()
                      where id = ${requestId}
                    `;
                } else {
                    await sql`
                      update public.upload_requests
                      set current_phase = '',
                          current_file_name = '',
                          updated_at = now()
                      where id = ${requestId}
                    `;
                }
            }
        } catch (error) {
            await sql`
              update public.upload_requests
              set status = ${REQUEST_STATUS_FAILED},
                  error = ${String(error?.message || "Failed to finish upload request.")},
                  finished_at = coalesce(finished_at, now()),
                  current_phase = '',
                  current_file_name = '',
                  updated_at = now()
              where id = ${requestId}
            `;
            const ready = await loadRunResponseSnapshot({
                requestId,
                command,
                includeFiles: includeFilesInResponse,
            });
            res.status(200).json(ready);
            return;
        }

        const ready = await loadRunResponseSnapshot({
            requestId,
            command,
            includeFiles: includeFilesInResponse,
        });
        try {
            if (autoSavedStatusesToSync.size > 0) {
                await syncParetoFilenameCsvs({ statuses: Array.from(autoSavedStatusesToSync) });
            }
        } catch {
            res.status(500).json({ error: "Upload step completed, but pareto filename CSV sync failed." });
            return;
        }
        res.status(200).json(ready);
    });
}

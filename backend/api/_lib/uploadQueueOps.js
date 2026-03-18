// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";
import { withDbRetry } from "./dbRetry.js";
import {
    FILE_PROCESS_STATE_NON_PROCESSED,
    FILE_PROCESS_STATE_PENDING,
    FILE_PROCESS_STATE_PROCESSING,
    FILE_VERDICT_NON_PROCESSED,
    REQUEST_STATUS_COMPLETED,
    REQUEST_STATUS_FREEZED,
    REQUEST_STATUS_INTERRUPTED,
    REQUEST_STATUS_PROCESSING,
    REQUEST_STATUS_WAITING_MANUAL_VERDICT,
    normalizeUploadRequestFileRow,
    normalizeUploadRequestRow,
} from "./uploadQueue.js";

export async function getCommandByAuthKey(authKey) {
    const result = await withDbRetry(() => sql`
      select id, name, role, max_single_upload_bytes, total_upload_quota_bytes, uploaded_bytes_total, max_multi_file_batch_count,
             abc_verify_timeout_seconds, abc_metrics_timeout_seconds
      from commands
      where auth_key = ${authKey}
      limit 1
    `);
    if (result.rows.length === 0) return null;
    return result.rows[0];
}

export async function loadUploadRequestSnapshot({ requestId, commandId, includeFiles = true }) {
    const requestRes = await withDbRetry(() => sql`
      select *
      from upload_requests
      where id = ${requestId}
        and command_id = ${commandId}
      limit 1
    `);
    if (requestRes.rows.length === 0) return null;
    const request = normalizeUploadRequestRow(requestRes.rows[0]);
    let files = [];
    if (includeFiles) {
        const filesRes = await withDbRetry(() => sql`
          select *
          from upload_request_files
          where request_id = ${requestId}
          order by order_index asc
        `);
        files = filesRes.rows.map(normalizeUploadRequestFileRow);
    }
    return { request, files };
}

export async function refreshUploadRequestCounters(requestId) {
    const counters = await withDbRetry(() => sql`
      select
        count(*)::int as total_count,
        count(*) filter (where lower(coalesce(process_state, '')) in ('processed', 'non-processed'))::int as done_count,
        count(*) filter (where lower(coalesce(verdict, '')) = 'verified')::int as verified_count,
        count(*) filter (where lower(coalesce(process_state, '')) = 'pending')::int as pending_count,
        count(*) filter (where not applied and can_apply)::int as manual_pending_count
      from upload_request_files
      where request_id = ${requestId}
    `);
    const row = counters.rows[0] || {};
    const totalCount = Math.max(0, Number(row.total_count || 0));
    const doneCount = Math.max(0, Number(row.done_count || 0));
    const verifiedCount = Math.max(0, Number(row.verified_count || 0));
    const pendingCount = Math.max(0, Number(row.pending_count || 0));
    const manualPendingCount = Math.max(0, Number(row.manual_pending_count || 0));
    let nextStatus = null;
    if (pendingCount <= 0 && manualPendingCount > 0) {
        nextStatus = REQUEST_STATUS_WAITING_MANUAL_VERDICT;
    } else if (pendingCount <= 0) {
        nextStatus = REQUEST_STATUS_COMPLETED;
    }
    await withDbRetry(() => sql`
      update upload_requests
      set total_count = ${totalCount},
          done_count = ${doneCount},
          verified_count = ${verifiedCount},
          updated_at = now(),
          status = case
              when ${nextStatus}::text is not null and lower(coalesce(status, '')) not in ('failed', 'closed')
                  then ${nextStatus}
              else status
          end,
          finished_at = case
              when ${nextStatus}::text = ${REQUEST_STATUS_COMPLETED} and finished_at is null then now()
              when ${nextStatus}::text = ${REQUEST_STATUS_WAITING_MANUAL_VERDICT} then null
              else finished_at
          end
      where id = ${requestId}
    `);
}

export async function markRemainingAsNonProcessed(
    requestId,
    {
        includeProcessing = false,
        reason = "Upload was interrupted before processing.",
    } = {}
) {
    await withDbRetry(() => sql`
      update upload_request_files
      set process_state = ${FILE_PROCESS_STATE_NON_PROCESSED},
          verdict = ${FILE_VERDICT_NON_PROCESSED},
          verdict_reason = case
              when coalesce(verdict_reason, '') = '' then ${String(reason || "Upload was interrupted before processing.")}
              else verdict_reason
          end,
          can_apply = false,
          default_checked = false,
          updated_at = now(),
          processed_at = now()
      where request_id = ${requestId}
        and (
            lower(coalesce(process_state, '')) = ${FILE_PROCESS_STATE_PENDING}
            or (
                ${Boolean(includeProcessing)}::boolean
                and lower(coalesce(process_state, '')) = ${FILE_PROCESS_STATE_PROCESSING}
            )
        )
    `);
    await refreshUploadRequestCounters(requestId);
    await withDbRetry(() => sql`
      update upload_requests
      set status = ${REQUEST_STATUS_INTERRUPTED},
          finished_at = coalesce(finished_at, now()),
          current_phase = '',
          current_file_name = '',
          updated_at = now()
      where id = ${requestId}
    `);
}

export async function isUploadStopRequested(requestId) {
    const requestRes = await withDbRetry(() => sql`
      select stop_requested
      from upload_requests
      where id = ${requestId}
      limit 1
    `);
    if (requestRes.rows.length === 0) return false;
    return Boolean(requestRes.rows[0]?.stop_requested);
}

export async function findLatestBlockingUploadRequest(commandId) {
    const requestRes = await withDbRetry(() => sql`
      select
        upload_requests.id,
        upload_requests.status
      from upload_requests
      where command_id = ${commandId}
        and lower(coalesce(upload_requests.status, '')) in (
            'queued',
            'processing',
            'freezed',
            'waiting_manual_verdict'
        )
      order by
        case
            when lower(coalesce(upload_requests.status, '')) = 'processing' then 0
            when lower(coalesce(upload_requests.status, '')) = 'queued' then 1
            when lower(coalesce(upload_requests.status, '')) = 'freezed' then 2
            when lower(coalesce(upload_requests.status, '')) = 'waiting_manual_verdict' then 3
            else 4
        end asc,
        upload_requests.updated_at desc,
        upload_requests.created_at desc
      limit 1
    `);
    if (requestRes.rows.length === 0) return null;
    return requestRes.rows[0];
}

export async function findNextPendingUploadFile(requestId) {
    const result = await withDbRetry(() => sql`
      select *
      from upload_request_files
      where request_id = ${requestId}
        and lower(coalesce(process_state, '')) = ${FILE_PROCESS_STATE_PENDING}
      order by order_index asc
      limit 1
    `);
    if (result.rows.length === 0) return null;
    return normalizeUploadRequestFileRow(result.rows[0]);
}

export async function resumeFreezedUploadRequests() {
    const resumed = await withDbRetry(() => sql`
      update upload_requests
      set status = ${REQUEST_STATUS_PROCESSING},
          error = null,
          finished_at = null,
          current_phase = '',
          current_file_name = '',
          updated_at = now()
      where lower(coalesce(status, '')) = ${REQUEST_STATUS_FREEZED}
      returning id
    `);
    return resumed.rows.length;
}

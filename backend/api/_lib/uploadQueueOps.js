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
import { ensurePointsStatusConstraint } from "./pointsStatus.js";

function dominatesPoint(lhs, rhs) {
    if (!lhs || !rhs) return false;
    const lhsDelay = Number(lhs.delay);
    const lhsArea = Number(lhs.area);
    const rhsDelay = Number(rhs.delay);
    const rhsArea = Number(rhs.area);
    if (!Number.isFinite(lhsDelay) || !Number.isFinite(lhsArea) || !Number.isFinite(rhsDelay) || !Number.isFinite(rhsArea)) {
        return false;
    }
    return lhsDelay <= rhsDelay && lhsArea <= rhsArea && (lhsDelay < rhsDelay || lhsArea < rhsArea);
}

function toFrontPoint(benchmark, delay, area, origin, fileId = "") {
    return {
        benchmark: String(benchmark || ""),
        delay: Number(delay),
        area: Number(area),
        origin: String(origin || ""),
        fileId: String(fileId || ""),
    };
}

function computeFrontMask(points) {
    const items = Array.isArray(points) ? points : [];
    return items.map((candidate, candidateIndex) => {
        for (let index = 0; index < items.length; index += 1) {
            if (index === candidateIndex) continue;
            if (dominatesPoint(items[index], candidate)) return false;
        }
        return true;
    });
}

function isUploadParetoEligible(fileRow) {
    const verdict = String(fileRow?.verdict || "").toLowerCase();
    const processState = String(fileRow?.processState || "").toLowerCase();
    const hasMetrics = Number.isFinite(Number(fileRow?.parsedDelay)) && Number.isFinite(Number(fileRow?.parsedArea));
    if (!hasMetrics) return false;
    if (!["processed", "non-processed"].includes(processState)) return false;
    return verdict === "verified" || verdict === "non-verified" || verdict === "warning";
}

function buildReplacedCoordsPayload(replacedPoints) {
    return JSON.stringify(
        (Array.isArray(replacedPoints) ? replacedPoints : [])
            .filter((point) => Number.isFinite(Number(point?.delay)) && Number.isFinite(Number(point?.area)))
            .map((point) => ({
                delay: Number(point.delay),
                area: Number(point.area),
            }))
    );
}

async function computeUploadParetoState({ requestId, commandId, commandName = "" }) {
    let resolvedCommandName = String(commandName || "").trim();
    if (!resolvedCommandName) {
        const commandRes = await withDbRetry(() => sql`
          select name
          from commands
          where id = ${commandId}
          limit 1
        `);
        resolvedCommandName = String(commandRes.rows[0]?.name || "").trim();
    }
    if (!resolvedCommandName) {
        return { paretoFrontCount: 0, fileMetaById: new Map() };
    }

    const requestFilesRes = await withDbRetry(() => sql`
      select
        id,
        order_index,
        original_file_name,
        process_state,
        verdict,
        can_apply,
        applied,
        point_id,
        parsed_benchmark,
        parsed_delay,
        parsed_area
      from upload_request_files
      where request_id = ${requestId}
      order by order_index asc
    `);
    const requestFiles = requestFilesRes.rows.map(normalizeUploadRequestFileRow);
    const requestPointIds = new Set(
        requestFiles
            .map((row) => String(row?.pointId || "").trim())
            .filter(Boolean)
    );

    await ensurePointsStatusConstraint();
    const pointsRes = await withDbRetry(() => sql`
      select id, benchmark, delay, area
      from points
      where sender = ${resolvedCommandName}
        and lower(coalesce(lifecycle_status, 'main')) <> 'deleted'
    `);
    const baselinePoints = pointsRes.rows
        .filter((row) => !requestPointIds.has(String(row.id || "")))
        .map((row) => toFrontPoint(row.benchmark, row.delay, row.area, "baseline"));

    const uploadCandidatePoints = requestFiles
        .filter((file) => isUploadParetoEligible(file) && (Boolean(file.applied) || Boolean(file.canApply)))
        .map((file) => toFrontPoint(file.parsedBenchmark, file.parsedDelay, file.parsedArea, "upload", String(file.id || "")));

    const pointsByBenchmark = new Map();
    const baselinePointsByBenchmark = new Map();
    for (const point of baselinePoints) {
        const benchmark = String(point?.benchmark || "");
        if (!pointsByBenchmark.has(benchmark)) pointsByBenchmark.set(benchmark, []);
        pointsByBenchmark.get(benchmark).push(point);
        if (!baselinePointsByBenchmark.has(benchmark)) baselinePointsByBenchmark.set(benchmark, []);
        baselinePointsByBenchmark.get(benchmark).push(point);
    }
    for (const point of uploadCandidatePoints) {
        const benchmark = String(point?.benchmark || "");
        if (!pointsByBenchmark.has(benchmark)) pointsByBenchmark.set(benchmark, []);
        pointsByBenchmark.get(benchmark).push(point);
    }

    const fileMetaById = new Map();
    for (const file of requestFiles) {
        fileMetaById.set(String(file.id || ""), { paretoState: "", replacedParetoCoords: [] });
    }

    let paretoFrontCount = 0;
    for (const [benchmark, benchmarkPoints] of pointsByBenchmark.entries()) {
        const frontMask = computeFrontMask(benchmarkPoints);
        const baselineBenchmarkPoints = baselinePointsByBenchmark.get(String(benchmark || "")) || [];
        const baselineFrontMask = computeFrontMask(baselineBenchmarkPoints);
        const baselineFrontPoints = baselineBenchmarkPoints.filter((_, index) => baselineFrontMask[index]);
        const frontPoints = benchmarkPoints.filter((_, index) => frontMask[index]);
        for (const point of frontPoints) {
            if (point.origin !== "upload" || !point.fileId) continue;
            paretoFrontCount += 1;
            const replacedParetoCoords = baselineFrontPoints
                .filter((candidate) => dominatesPoint(point, candidate))
                .map((candidate) => ({ delay: Number(candidate.delay), area: Number(candidate.area) }))
                .filter((candidate) => Number.isFinite(candidate.delay) && Number.isFinite(candidate.area));
            fileMetaById.set(String(point.fileId), {
                paretoState: "new-front",
                replacedParetoCoords,
            });
        }
    }

    return { paretoFrontCount, fileMetaById };
}

function shouldComputeParetoForSnapshot({ paretoMode }) {
    const normalizedMode = String(paretoMode || "always").trim().toLowerCase();
    if (normalizedMode === "never") return false;
    if (normalizedMode === "always") return true;
    if (normalizedMode === "final_only") {
        return false;
    }
    return true;
}

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

export async function loadUploadRequestSnapshot({
    requestId,
    commandId,
    includeFiles = true,
    commandName = "",
    paretoMode = "always",
}) {
    const requestRes = await withDbRetry(() => sql`
      select
        id,
        command_id,
        status,
        stop_requested,
        selected_parser,
        selected_checker,
        parser_timeout_seconds,
        checker_timeout_seconds,
        description,
        manual_synthesis,
        auto_manual_window,
        total_count,
        done_count,
        verified_count,
        pareto_front_count,
        current_file_name,
        current_phase,
        error,
        created_at,
        updated_at,
        finished_at
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
          select
            id,
            order_index,
            original_file_name,
            process_state,
            verdict,
            verdict_reason,
            can_apply,
            default_checked,
            manual_review_required,
            applied,
            point_id,
            checker_version,
            parsed_benchmark,
            parsed_delay,
            parsed_area,
            final_file_name,
            pareto_state,
            replaced_pareto_coords
          from upload_request_files
          where request_id = ${requestId}
          order by order_index asc
        `);
        files = filesRes.rows.map(normalizeUploadRequestFileRow);
        if (shouldComputeParetoForSnapshot({
            paretoMode,
        })) {
            const paretoState = await computeUploadParetoState({ requestId, commandId, commandName });
            request.paretoFrontCount = Number(paretoState.paretoFrontCount || 0);
            files = files.map((row) => {
                const meta = paretoState.fileMetaById.get(String(row.id || ""));
                if (!meta) return row;
                return {
                    ...row,
                    paretoState: String(meta.paretoState || ""),
                    replacedParetoCoords: Array.isArray(meta.replacedParetoCoords) ? meta.replacedParetoCoords : [],
                };
            });
        }
    }
    return { request, files };
}

export async function refreshUploadRequestCounters(requestId) {
    const counters = await withDbRetry(() => sql`
      select
        coalesce(max(case when upload_requests.auto_manual_window then 1 else 0 end), 1)::int as auto_manual_window,
        count(*)::int as total_count,
        count(*) filter (where lower(coalesce(process_state, '')) in ('processed', 'non-processed'))::int as done_count,
        count(*) filter (where lower(coalesce(verdict, '')) = 'verified')::int as verified_count,
        count(*) filter (where lower(coalesce(process_state, '')) = 'pending')::int as pending_count,
        count(*) filter (where not applied and can_apply)::int as savable_pending_count,
        count(*) filter (where not applied and can_apply and manual_review_required)::int as manual_pending_count
      from upload_request_files
      join upload_requests on upload_requests.id = upload_request_files.request_id
      where upload_request_files.request_id = ${requestId}
    `);
    const row = counters.rows[0] || {};
    const autoManualWindow = row.auto_manual_window == null
        ? true
        : Number(row.auto_manual_window) !== 0;
    const totalCount = Math.max(0, Number(row.total_count || 0));
    const doneCount = Math.max(0, Number(row.done_count || 0));
    const verifiedCount = Math.max(0, Number(row.verified_count || 0));
    const pendingCount = Math.max(0, Number(row.pending_count || 0));
    const savablePendingCount = Math.max(0, Number(row.savable_pending_count || 0));
    const manualPendingCount = Math.max(0, Number(row.manual_pending_count || 0));
    let nextStatus = null;
    if (pendingCount <= 0 && manualPendingCount > 0 && !autoManualWindow) {
        nextStatus = REQUEST_STATUS_WAITING_MANUAL_VERDICT;
    } else if (pendingCount <= 0 && savablePendingCount <= 0) {
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
    return {
        totalCount,
        doneCount,
        verifiedCount,
        pendingCount,
        savablePendingCount,
        manualPendingCount,
        nextStatus,
    };
}

export async function finalizeUploadRequestPareto({ requestId, commandId = 0, commandName = "" }) {
    let resolvedCommandId = Math.max(0, Number(commandId || 0));
    if (resolvedCommandId <= 0) {
        const reqMetaRes = await withDbRetry(() => sql`
          select command_id
          from upload_requests
          where id = ${requestId}
          limit 1
        `);
        resolvedCommandId = Math.max(0, Number(reqMetaRes.rows[0]?.command_id || 0));
    }
    if (resolvedCommandId <= 0) {
        return { paretoFrontCount: 0 };
    }

    const paretoState = await computeUploadParetoState({
        requestId,
        commandId: resolvedCommandId,
        commandName,
    });

    await withDbRetry(() => sql`
      update upload_requests
      set pareto_front_count = ${Math.max(0, Number(paretoState.paretoFrontCount || 0))}
      where id = ${requestId}
    `);
    for (const [fileId, meta] of paretoState.fileMetaById.entries()) {
        await withDbRetry(() => sql`
          update upload_request_files
          set pareto_state = ${String(meta?.paretoState || "")},
              replaced_pareto_coords = ${buildReplacedCoordsPayload(meta?.replacedParetoCoords || [])}
          where id = ${fileId}
        `);
    }

    return {
        paretoFrontCount: Math.max(0, Number(paretoState.paretoFrontCount || 0)),
    };
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
          manual_review_required = false,
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
    const counters = await refreshUploadRequestCounters(requestId);
    const pendingCount = Number(counters?.pendingCount);
    if (Number.isFinite(pendingCount) && pendingCount <= 0) {
        await finalizeUploadRequestPareto({ requestId });
    }
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

export async function findLatestVisibleUploadRequest(commandId) {
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
            'waiting_manual_verdict',
            'completed',
            'interrupted',
            'failed',
            'closed'
        )
      order by
        case
            when lower(coalesce(upload_requests.status, '')) = 'processing' then 0
            when lower(coalesce(upload_requests.status, '')) = 'queued' then 1
            when lower(coalesce(upload_requests.status, '')) = 'freezed' then 2
            when lower(coalesce(upload_requests.status, '')) = 'waiting_manual_verdict' then 3
            when lower(coalesce(upload_requests.status, '')) = 'completed' then 4
            when lower(coalesce(upload_requests.status, '')) = 'interrupted' then 5
            when lower(coalesce(upload_requests.status, '')) = 'failed' then 6
            when lower(coalesce(upload_requests.status, '')) = 'closed' then 7
            else 8
        end asc,
        coalesce(upload_requests.finished_at, upload_requests.updated_at, upload_requests.created_at) desc,
        upload_requests.updated_at desc,
        upload_requests.created_at desc
      limit 1
    `);
    if (requestRes.rows.length === 0) return null;
    return requestRes.rows[0];
}

export async function findNextPendingUploadFile(requestId) {
    const result = await withDbRetry(() => sql`
      select
        id,
        order_index,
        original_file_name,
        queue_file_key,
        file_size,
        process_state
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

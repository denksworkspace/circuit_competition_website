// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";

export const REQUEST_STATUS_QUEUED = "queued";
export const REQUEST_STATUS_PROCESSING = "processing";
export const REQUEST_STATUS_FREEZED = "freezed";
export const REQUEST_STATUS_WAITING_MANUAL_VERDICT = "waiting_manual_verdict";
export const REQUEST_STATUS_COMPLETED = "completed";
export const REQUEST_STATUS_INTERRUPTED = "interrupted";
export const REQUEST_STATUS_FAILED = "failed";
export const REQUEST_STATUS_CLOSED = "closed";

export const FILE_PROCESS_STATE_PENDING = "pending";
export const FILE_PROCESS_STATE_PROCESSING = "processing";
export const FILE_PROCESS_STATE_PROCESSED = "processed";
export const FILE_PROCESS_STATE_NON_PROCESSED = "non-processed";

export const FILE_VERDICT_PENDING = "pending";
export const FILE_VERDICT_VERIFIED = "verified";
export const FILE_VERDICT_FAILED = "failed";
export const FILE_VERDICT_NON_VERIFIED = "non-verified";
export const FILE_VERDICT_DUPLICATE = "duplicate";
export const FILE_VERDICT_WARNING = "warning";
export const FILE_VERDICT_BLOCKED = "blocked";
export const FILE_VERDICT_NON_PROCESSED = "non-processed";

const ACTIVE_REQUEST_STATUSES = new Set([REQUEST_STATUS_QUEUED, REQUEST_STATUS_PROCESSING, REQUEST_STATUS_FREEZED]);

let uploadQueueSchemaReadyPromise = null;

export async function ensureUploadQueueSchema() {
    if (!uploadQueueSchemaReadyPromise) {
        uploadQueueSchemaReadyPromise = (async () => {
            await sql`
              create table if not exists public.upload_requests (
                id text primary key,
                command_id bigint not null references public.commands(id) on delete cascade,
                status text not null default 'queued',
                stop_requested boolean not null default false,
                selected_parser text not null default 'none',
                selected_checker text not null default 'none',
                parser_timeout_seconds integer not null default 60,
                checker_timeout_seconds integer not null default 60,
                description text not null default 'circuit',
                manual_synthesis boolean not null default false,
                auto_manual_window boolean not null default true,
                total_count integer not null default 0,
                done_count integer not null default 0,
                verified_count integer not null default 0,
                pareto_front_count integer not null default 0,
                current_file_name text not null default '',
                current_phase text not null default '',
                error text,
                created_at timestamptz not null default now(),
                updated_at timestamptz not null default now(),
                finished_at timestamptz
              )
            `;
            await sql`
              alter table public.upload_requests
              add column if not exists pareto_front_count integer not null default 0
            `;
            await sql`
              alter table public.upload_requests
              alter column description set default 'circuit'
            `;
            await sql`
              alter table public.upload_requests
              add column if not exists manual_synthesis boolean not null default false
            `;
            await sql`
              alter table public.upload_requests
              add column if not exists auto_manual_window boolean not null default true
            `;
            await sql`
              alter table public.upload_requests
              drop constraint if exists upload_requests_status_check
            `;
            await sql`
              alter table public.upload_requests
              add constraint upload_requests_status_check
              check (
                lower(coalesce(status, '')) in (
                    'queued',
                    'processing',
                    'freezed',
                    'waiting_manual_verdict',
                    'completed',
                    'interrupted',
                    'failed',
                    'closed'
                )
              )
            `;
            await sql`
              create index if not exists upload_requests_command_status_idx
              on public.upload_requests(command_id, status, created_at desc)
            `;

            await sql`
              create table if not exists public.upload_request_files (
                id text primary key,
                request_id text not null references public.upload_requests(id) on delete cascade,
                order_index integer not null,
                original_file_name text not null,
                queue_file_key text not null,
                file_size bigint not null default 0,
                process_state text not null default 'pending',
                verdict text not null default 'pending',
                verdict_reason text not null default '',
                can_apply boolean not null default false,
                default_checked boolean not null default false,
                manual_review_required boolean not null default false,
                applied boolean not null default false,
                point_id text,
                checker_version text,
                parsed_benchmark text,
                parsed_delay integer,
                parsed_area integer,
                final_file_name text,
                pareto_state text not null default '',
                replaced_pareto_coords text not null default '',
                created_at timestamptz not null default now(),
                updated_at timestamptz not null default now(),
                processed_at timestamptz
              )
            `;
            await sql`
              alter table public.upload_request_files
              add column if not exists pareto_state text not null default ''
            `;
            await sql`
              alter table public.upload_request_files
              add column if not exists replaced_pareto_coords text not null default ''
            `;
            await sql`
              alter table public.upload_request_files
              add column if not exists manual_review_required boolean not null default false
            `;
            await sql`
              alter table public.upload_request_files
              drop constraint if exists upload_request_files_process_state_check
            `;
            await sql`
              alter table public.upload_request_files
              add constraint upload_request_files_process_state_check
              check (lower(coalesce(process_state, '')) in ('pending', 'processing', 'processed', 'non-processed'))
            `;
            await sql`
              alter table public.upload_request_files
              drop constraint if exists upload_request_files_verdict_check
            `;
            await sql`
              alter table public.upload_request_files
              add constraint upload_request_files_verdict_check
              check (lower(coalesce(verdict, '')) in ('pending', 'verified', 'failed', 'non-verified', 'duplicate', 'warning', 'blocked', 'non-processed'))
            `;
            await sql`
              create unique index if not exists upload_request_files_request_order_uidx
              on public.upload_request_files(request_id, order_index)
            `;
            await sql`
              create index if not exists upload_request_files_request_state_idx
              on public.upload_request_files(request_id, process_state, order_index)
            `;
        })().catch((error) => {
            uploadQueueSchemaReadyPromise = null;
            throw error;
        });
    }
    return uploadQueueSchemaReadyPromise;
}

export function isActiveRequestStatus(statusRaw) {
    return ACTIVE_REQUEST_STATUSES.has(String(statusRaw || "").trim().toLowerCase());
}

export function normalizeUploadRequestRow(row) {
    if (!row) return null;
    return {
        id: String(row.id || ""),
        commandId: Number(row.command_id || 0),
        status: String(row.status || REQUEST_STATUS_QUEUED),
        stopRequested: Boolean(row.stop_requested),
        selectedParser: String(row.selected_parser || "none"),
        selectedChecker: String(row.selected_checker || "none"),
        parserTimeoutSeconds: Math.max(1, Number(row.parser_timeout_seconds || 60)),
        checkerTimeoutSeconds: Math.max(1, Number(row.checker_timeout_seconds || 60)),
        description: String(row.description || "circuit"),
        manualSynthesis: Boolean(row.manual_synthesis),
        autoManualWindow: row.auto_manual_window == null ? true : Boolean(row.auto_manual_window),
        totalCount: Math.max(0, Number(row.total_count || 0)),
        doneCount: Math.max(0, Number(row.done_count || 0)),
        verifiedCount: Math.max(0, Number(row.verified_count || 0)),
        paretoFrontCount: Math.max(0, Number(row.pareto_front_count || 0)),
        currentFileName: String(row.current_file_name || ""),
        currentPhase: String(row.current_phase || ""),
        error: row.error ? String(row.error) : null,
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null,
        finishedAt: row.finished_at || null,
    };
}

export function normalizeUploadRequestFileRow(row) {
    if (!row) return null;
    return {
        id: String(row.id || ""),
        requestId: String(row.request_id || ""),
        orderIndex: Number(row.order_index || 0),
        originalFileName: String(row.original_file_name || ""),
        queueFileKey: String(row.queue_file_key || ""),
        fileSize: Math.max(0, Number(row.file_size || 0)),
        processState: String(row.process_state || FILE_PROCESS_STATE_PENDING),
        verdict: String(row.verdict || FILE_VERDICT_PENDING),
        verdictReason: String(row.verdict_reason || ""),
        canApply: Boolean(row.can_apply),
        defaultChecked: Boolean(row.default_checked),
        manualReviewRequired: Boolean(row.manual_review_required),
        applied: Boolean(row.applied),
        pointId: row.point_id ? String(row.point_id) : null,
        checkerVersion: row.checker_version ? String(row.checker_version) : null,
        parsedBenchmark: row.parsed_benchmark ? String(row.parsed_benchmark) : null,
        parsedDelay: row.parsed_delay == null ? null : Number(row.parsed_delay),
        parsedArea: row.parsed_area == null ? null : Number(row.parsed_area),
        finalFileName: row.final_file_name ? String(row.final_file_name) : null,
        paretoState: String(row.pareto_state || ""),
        replacedParetoCoords: (() => {
            const raw = String(row.replaced_pareto_coords || "").trim();
            if (!raw) return [];
            try {
                const parsed = JSON.parse(raw);
                if (!Array.isArray(parsed)) return [];
                return parsed
                    .map((item) => ({
                        delay: Number(item?.delay),
                        area: Number(item?.area),
                    }))
                    .filter((item) => Number.isFinite(item.delay) && Number.isFinite(item.area));
            } catch {
                return [];
            }
        })(),
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null,
        processedAt: row.processed_at || null,
    };
}

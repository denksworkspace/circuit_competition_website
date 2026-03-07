// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";

const MAX_EVENT_TYPE_LEN = 100;
const MAX_SOURCE_LEN = 100;
const MAX_PATH_LEN = 400;
const MAX_SESSION_ID_LEN = 120;
const MAX_DETAILS_BYTES = 16 * 1024;
const MAX_BATCH_SIZE = 200;

let siteActivityLogsReadyPromise = null;

function clampText(valueRaw, maxLen) {
    const value = String(valueRaw || "").trim();
    if (!value) return "";
    return value.slice(0, maxLen);
}

function normalizeTimestamp(valueRaw) {
    const value = String(valueRaw || "").trim();
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
}

function normalizeDetails(detailsRaw) {
    if (detailsRaw == null || typeof detailsRaw !== "object") return null;
    try {
        const json = JSON.stringify(detailsRaw);
        if (!json || json.length > MAX_DETAILS_BYTES) return null;
        return JSON.parse(json);
    } catch {
        return null;
    }
}

function normalizeEvent(eventRaw) {
    if (!eventRaw || typeof eventRaw !== "object") return null;
    const eventType = clampText(eventRaw.eventType, MAX_EVENT_TYPE_LEN);
    if (!eventType) return null;
    return {
        eventType,
        source: clampText(eventRaw.source, MAX_SOURCE_LEN),
        pagePath: clampText(eventRaw.pagePath, MAX_PATH_LEN),
        sessionId: clampText(eventRaw.sessionId, MAX_SESSION_ID_LEN),
        clientTimestamp: normalizeTimestamp(eventRaw.clientTimestamp),
        details: normalizeDetails(eventRaw.details),
    };
}

export function normalizeSiteActivityEvents(eventsRaw) {
    const rawList = Array.isArray(eventsRaw) ? eventsRaw : [eventsRaw];
    const normalized = [];
    for (const raw of rawList.slice(0, MAX_BATCH_SIZE)) {
        const row = normalizeEvent(raw);
        if (row) normalized.push(row);
    }
    return normalized;
}

export async function ensureSiteActivityLogsSchema() {
    if (!siteActivityLogsReadyPromise) {
        siteActivityLogsReadyPromise = (async () => {
            await sql`
              create table if not exists site_activity_logs (
                id bigserial primary key,
                event_type text not null,
                source text,
                page_path text,
                session_id text,
                client_timestamp timestamptz,
                details jsonb,
                created_at timestamptz not null default now()
              )
            `;

            await sql`
              create index if not exists site_activity_logs_created_at_idx
              on site_activity_logs(created_at desc)
            `;
            await sql`
              create index if not exists site_activity_logs_event_type_idx
              on site_activity_logs(event_type, created_at desc)
            `;
            await sql`
              create index if not exists site_activity_logs_session_id_idx
              on site_activity_logs(session_id, created_at desc)
            `;
        })().catch((error) => {
            siteActivityLogsReadyPromise = null;
            throw error;
        });
    }
    return siteActivityLogsReadyPromise;
}

export async function addSiteActivityLogs(eventsRaw) {
    const events = normalizeSiteActivityEvents(eventsRaw);
    if (events.length === 0) return 0;
    await ensureSiteActivityLogsSchema();
    for (const event of events) {
        await sql`
          insert into site_activity_logs (
            event_type,
            source,
            page_path,
            session_id,
            client_timestamp,
            details
          )
          values (
            ${event.eventType},
            ${event.source || null},
            ${event.pagePath || null},
            ${event.sessionId || null},
            ${event.clientTimestamp || null},
            ${event.details ? JSON.stringify(event.details) : null}::jsonb
          )
        `;
    }
    return events.length;
}

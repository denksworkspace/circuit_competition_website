// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";
import { authenticateAdmin } from "./adminUsers/utils.js";

const SETTINGS_KEY = "maintenance_mode";
const DEFAULT_MESSAGE = "Technical maintenance is in progress. Please try again later.";
const ENABLED_REFRESH_MS = Math.max(1000, Number(process.env.MAINTENANCE_ENABLED_REFRESH_MS || 15000));
const EXEMPT_MUTATION_PATHS = new Set([
    "/api/auth",
    "/api/site-activity-log",
    "/api/admin-maintenance",
]);

let maintenanceSettingsReadyPromise = null;
let maintenanceStateCache = normalizeMaintenanceState({});
let maintenanceStateLoaded = false;
let maintenanceStateLoadedAtMs = 0;
let maintenanceStateLoadPromise = null;

function normalizeWhitelist(rawList) {
    if (!Array.isArray(rawList)) return [];
    const set = new Set();
    for (const item of rawList) {
        const id = Number(item);
        if (Number.isInteger(id) && id > 0) set.add(id);
    }
    return [...set].sort((a, b) => a - b);
}

function normalizeMessage(rawMessage) {
    const value = String(rawMessage || "").trim();
    if (!value) return DEFAULT_MESSAGE;
    return value.slice(0, 500);
}

function normalizeMaintenanceState(rawState) {
    const value = rawState && typeof rawState === "object" ? rawState : {};
    return {
        enabled: Boolean(value.enabled),
        message: normalizeMessage(value.message),
        whitelistAdminIds: normalizeWhitelist(value.whitelistAdminIds),
    };
}

export function parseWhitelistAdminIds(rawValue) {
    if (Array.isArray(rawValue)) return normalizeWhitelist(rawValue);
    const text = String(rawValue || "").trim();
    if (!text) return [];
    return normalizeWhitelist(
        text
            .split(/[,\s]+/)
            .map((part) => Number(part))
            .filter((item) => Number.isFinite(item))
    );
}

export function isMutationMethod(methodRaw) {
    const method = String(methodRaw || "").toUpperCase();
    return method === "POST" || method === "PATCH" || method === "PUT" || method === "DELETE";
}

function isLocalHost(hostRaw) {
    const host = String(hostRaw || "").toLowerCase();
    return host.includes("localhost") || host.includes("127.0.0.1");
}

export async function ensureMaintenanceSettingsSchema() {
    if (!maintenanceSettingsReadyPromise) {
        maintenanceSettingsReadyPromise = (async () => {
            await sql`
              create table if not exists public.app_runtime_settings (
                key text primary key,
                value jsonb not null,
                updated_at timestamptz not null default now()
              )
            `;
            await sql`
              create index if not exists app_runtime_settings_updated_at_idx
              on public.app_runtime_settings(updated_at desc)
            `;
        })().catch((error) => {
            maintenanceSettingsReadyPromise = null;
            throw error;
        });
    }
    return maintenanceSettingsReadyPromise;
}

function setMaintenanceStateCache(state) {
    maintenanceStateCache = normalizeMaintenanceState(state);
    maintenanceStateLoaded = true;
    maintenanceStateLoadedAtMs = Date.now();
}

function shouldRefreshEnabledState() {
    if (!maintenanceStateLoaded) return true;
    if (!maintenanceStateCache.enabled) return false;
    return Date.now() - maintenanceStateLoadedAtMs >= ENABLED_REFRESH_MS;
}

async function readMaintenanceStateFromDb() {
    await ensureMaintenanceSettingsSchema();
    const result = await sql`
      select value
      from public.app_runtime_settings
      where key = ${SETTINGS_KEY}
      limit 1
    `;
    if (result.rows.length === 0) return normalizeMaintenanceState({});
    return normalizeMaintenanceState(result.rows[0]?.value || {});
}

async function loadMaintenanceState({ force = false } = {}) {
    if (!force && maintenanceStateLoaded && !shouldRefreshEnabledState()) {
        return maintenanceStateCache;
    }
    if (maintenanceStateLoadPromise) {
        return maintenanceStateLoadPromise;
    }
    maintenanceStateLoadPromise = (async () => {
        const state = await readMaintenanceStateFromDb();
        setMaintenanceStateCache(state);
        return state;
    })().finally(() => {
        maintenanceStateLoadPromise = null;
    });
    return maintenanceStateLoadPromise;
}

export async function getMaintenanceState() {
    return loadMaintenanceState({ force: shouldRefreshEnabledState() });
}

export async function setMaintenanceState({ enabled, message, whitelistAdminIds }) {
    await ensureMaintenanceSettingsSchema();
    const nextState = normalizeMaintenanceState({ enabled, message, whitelistAdminIds });
    await sql`
      insert into public.app_runtime_settings (key, value, updated_at)
      values (${SETTINGS_KEY}, ${JSON.stringify(nextState)}::jsonb, now())
      on conflict (key)
      do update set
        value = excluded.value,
        updated_at = now()
    `;
    setMaintenanceStateCache(nextState);
    return nextState;
}

function extractAuthKeyFromRequest(req) {
    const fromQuery = String(req?.query?.authKey || "").trim();
    if (fromQuery) return fromQuery;
    const fromBody = String(req?.body?.authKey || "").trim();
    return fromBody;
}

export async function canBypassMaintenance(req, _whitelistAdminIds) {
    const authKey = extractAuthKeyFromRequest(req);
    if (!authKey) return false;
    const admin = await authenticateAdmin(authKey);
    if (!admin) return false;
    // Any authenticated admin always bypasses maintenance mode.
    // Whitelist is kept for visibility/editing in settings, but admin access has priority.
    return true;
}

export async function checkMaintenanceBlock(req) {
    if (!isMutationMethod(req?.method)) return { blocked: false, state: null };
    if (isLocalHost(req?.headers?.host)) return { blocked: false, state: null };
    const pathName = String(req?.urlPath || req?.url || "").trim();
    if (EXEMPT_MUTATION_PATHS.has(pathName)) return { blocked: false, state: null };

    const state = await getMaintenanceState();
    if (!state.enabled) return { blocked: false, state };
    const bypass = await canBypassMaintenance(req, state.whitelistAdminIds);
    if (bypass) return { blocked: false, state };
    return { blocked: true, state };
}

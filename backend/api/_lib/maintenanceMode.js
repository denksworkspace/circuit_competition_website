// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";
import { authenticateAdmin } from "./adminUsers/utils.js";

const SETTINGS_KEY = "maintenance_mode";
const DEFAULT_MESSAGE = "Technical maintenance is in progress. Please try again later.";
const DEFAULT_DEPLOY_DRIFT_SECONDS = 1800;
const FRONTEND_BUILD_TS_HEADER = "x-frontend-build-ts";
const EXEMPT_MUTATION_PATHS = new Set([
    "/api/auth",
    "/api/site-activity-log",
    "/api/admin-maintenance",
]);
const DEPLOY_MISMATCH_MESSAGE = "Deployment mismatch detected between frontend and backend. Technical maintenance is in progress.";
const BACKEND_BUILD_TS = Number.isFinite(Number(process.env.APP_BUILD_TS))
    ? Math.trunc(Number(process.env.APP_BUILD_TS))
    : Date.now();

let maintenanceSettingsReadyPromise = null;

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

function getHeaderValue(req, key) {
    const raw = req?.headers?.[key];
    if (Array.isArray(raw)) return String(raw[0] || "").trim();
    return String(raw || "").trim();
}

function parseBuildTimestamp(raw) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return null;
    return Math.trunc(value);
}

function getMaxDeployDriftSeconds() {
    const raw = Number(process.env.APP_DEPLOY_MAX_DRIFT_SECONDS);
    if (!Number.isFinite(raw)) return DEFAULT_DEPLOY_DRIFT_SECONDS;
    if (raw <= 0) return 0;
    return Math.trunc(raw);
}

export function getDeployCompatibilityState(req) {
    if (isLocalHost(req?.headers?.host)) {
        return {
            mismatch: false,
            reason: "local",
            message: "",
            frontendBuildTs: null,
            backendBuildTs: BACKEND_BUILD_TS,
            maxDriftSeconds: getMaxDeployDriftSeconds(),
            driftSeconds: 0,
        };
    }

    const maxDriftSeconds = getMaxDeployDriftSeconds();
    if (maxDriftSeconds <= 0) {
        return {
            mismatch: false,
            reason: "disabled",
            message: "",
            frontendBuildTs: null,
            backendBuildTs: BACKEND_BUILD_TS,
            maxDriftSeconds,
            driftSeconds: 0,
        };
    }

    const frontendBuildTs = parseBuildTimestamp(getHeaderValue(req, FRONTEND_BUILD_TS_HEADER));
    if (!frontendBuildTs) {
        return {
            mismatch: false,
            reason: "missing-client-build",
            message: "",
            frontendBuildTs: null,
            backendBuildTs: BACKEND_BUILD_TS,
            maxDriftSeconds,
            driftSeconds: 0,
        };
    }

    const driftSeconds = Math.abs(frontendBuildTs - BACKEND_BUILD_TS) / 1000;
    if (driftSeconds <= maxDriftSeconds) {
        return {
            mismatch: false,
            reason: "ok",
            message: "",
            frontendBuildTs,
            backendBuildTs: BACKEND_BUILD_TS,
            maxDriftSeconds,
            driftSeconds,
        };
    }

    return {
        mismatch: true,
        reason: "deploy-drift",
        message: DEPLOY_MISMATCH_MESSAGE,
        frontendBuildTs,
        backendBuildTs: BACKEND_BUILD_TS,
        maxDriftSeconds,
        driftSeconds,
    };
}

export async function ensureMaintenanceSettingsSchema() {
    if (!maintenanceSettingsReadyPromise) {
        maintenanceSettingsReadyPromise = (async () => {
            await sql`
              create table if not exists app_runtime_settings (
                key text primary key,
                value jsonb not null,
                updated_at timestamptz not null default now()
              )
            `;
            await sql`
              create index if not exists app_runtime_settings_updated_at_idx
              on app_runtime_settings(updated_at desc)
            `;
        })().catch((error) => {
            maintenanceSettingsReadyPromise = null;
            throw error;
        });
    }
    return maintenanceSettingsReadyPromise;
}

export async function getMaintenanceState() {
    await ensureMaintenanceSettingsSchema();
    const result = await sql`
      select value
      from app_runtime_settings
      where key = ${SETTINGS_KEY}
      limit 1
    `;
    if (result.rows.length === 0) return normalizeMaintenanceState({});
    return normalizeMaintenanceState(result.rows[0]?.value || {});
}

export async function setMaintenanceState({ enabled, message, whitelistAdminIds }) {
    await ensureMaintenanceSettingsSchema();
    const nextState = normalizeMaintenanceState({ enabled, message, whitelistAdminIds });
    await sql`
      insert into app_runtime_settings (key, value, updated_at)
      values (${SETTINGS_KEY}, ${JSON.stringify(nextState)}::jsonb, now())
      on conflict (key)
      do update set
        value = excluded.value,
        updated_at = now()
    `;
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

export async function resolveMaintenanceStatus(req) {
    const compatibility = getDeployCompatibilityState(req);
    if (compatibility.mismatch) {
        return {
            enabled: true,
            activeForUser: true,
            bypass: false,
            message: compatibility.message,
            reason: "deploy_mismatch",
            compatibility,
        };
    }

    const state = await getMaintenanceState();
    const bypass = state.enabled
        ? await canBypassMaintenance(req, state.whitelistAdminIds)
        : false;

    return {
        enabled: state.enabled,
        activeForUser: state.enabled && !bypass,
        bypass,
        message: state.message,
        reason: state.enabled ? "manual" : "none",
        compatibility,
    };
}

export async function checkMaintenanceBlock(req) {
    if (!isMutationMethod(req?.method)) return { blocked: false, state: null };
    if (isLocalHost(req?.headers?.host)) return { blocked: false, state: null };
    const pathName = String(req?.urlPath || req?.url || "").trim();
    if (EXEMPT_MUTATION_PATHS.has(pathName)) return { blocked: false, state: null };

    const resolved = await resolveMaintenanceStatus(req);
    if (!resolved.activeForUser) return { blocked: false, state: resolved };
    return { blocked: true, state: resolved };
}

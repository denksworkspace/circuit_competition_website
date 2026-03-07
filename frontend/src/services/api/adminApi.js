import { apiUrl, parseJsonSafe } from "../http/client.js";

export async function runAdminBulkVerify({ authKey, checkerVersion }) {
    const response = await fetch(apiUrl("/api/admin-points-verify"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authKey, checkerVersion }),
    });
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.error || "Failed to run bulk verification.");
    }
    return {
        checkerVersion: data?.checkerVersion || "ABC",
        log: Array.isArray(data?.log) ? data.log : [],
    };
}

export async function runAdminBulkVerifyPoint({ authKey, checkerVersion, pointId, signal, progressToken }) {
    const response = await fetch(apiUrl("/api/admin-points-verify"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({ authKey, checkerVersion, pointId, progressToken }),
    });
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.error || "Failed to verify point.");
    }
    const log = Array.isArray(data?.log) ? data.log : [];
    return log[0] || null;
}

export async function applyAdminPointStatuses({ authKey, updates, checkerVersion }) {
    const response = await fetch(apiUrl("/api/admin-points-apply"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authKey, updates, checkerVersion }),
    });
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.error || "Failed to apply statuses.");
    }
    return data;
}

export async function runAdminMetricsAudit({ authKey }) {
    const response = await fetch(apiUrl("/api/admin-points-audit"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authKey }),
    });
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.error || "Failed to run metrics audit.");
    }
    return {
        mismatches: Array.isArray(data?.mismatches) ? data.mismatches : [],
    };
}

export async function runAdminMetricsAuditPoint({ authKey, pointId, signal, progressToken }) {
    const response = await fetch(apiUrl("/api/admin-points-audit"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({ authKey, pointId, progressToken }),
    });
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.error || "Failed to audit point.");
    }
    const mismatches = Array.isArray(data?.mismatches) ? data.mismatches : [];
    return mismatches[0] || null;
}

export async function runAdminIdenticalAudit({ authKey, signal, progressToken }) {
    const response = await fetch(apiUrl("/api/admin-points-identical"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({ authKey, mode: "scan", progressToken }),
    });
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.error || "Failed to run identical points audit.");
    }
    return {
        scannedPoints: Number(data?.scannedPoints || 0),
        failedPoints: Number(data?.failedPoints || 0),
        failures: Array.isArray(data?.failures) ? data.failures : [],
        log: Array.isArray(data?.log) ? data.log : [],
        groups: Array.isArray(data?.groups) ? data.groups : [],
    };
}

export async function applyAdminIdenticalResolutions({ authKey, resolutions, signal }) {
    const response = await fetch(apiUrl("/api/admin-points-identical"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
            authKey,
            mode: "apply",
            resolutions,
        }),
    });
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.error || "Failed to apply identical points resolutions.");
    }
    return {
        deletedPoints: Number(data?.deletedPoints || 0),
        appliedGroups: Number(data?.appliedGroups || 0),
    };
}

export async function fetchAdminUserById({ authKey, userId }) {
    const query = new URLSearchParams({
        authKey: String(authKey || ""),
        userId: String(userId || ""),
    });

    const response = await fetch(apiUrl(`/api/admin-users?${query.toString()}`));
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.error || "Failed to load user.");
    }

    return {
        user: data?.user || null,
        actionLogs: Array.isArray(data?.actionLogs) ? data.actionLogs : [],
    };
}

export async function fetchAdminActionLogs({ authKey, limit = 500 }) {
    const query = new URLSearchParams({
        authKey: String(authKey || ""),
        scope: "all",
        limit: String(limit),
    });

    const response = await fetch(apiUrl(`/api/admin-users?${query.toString()}`));
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.error || "Failed to load action logs.");
    }

    return {
        actionLogs: Array.isArray(data?.actionLogs) ? data.actionLogs : [],
    };
}

export async function updateAdminUserUploadSettings({
    authKey,
    userId,
    maxSingleUploadGb,
    totalUploadQuotaGb,
    maxMultiFileBatchCount,
    abcVerifyTimeoutSeconds,
    abcMetricsTimeoutSeconds,
}) {
    const response = await fetch(apiUrl("/api/admin-users"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            authKey,
            userId,
            maxSingleUploadGb,
            totalUploadQuotaGb,
            maxMultiFileBatchCount,
            abcVerifyTimeoutSeconds,
            abcMetricsTimeoutSeconds,
        }),
    });

    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.error || "Failed to update user settings.");
    }

    return {
        user: data?.user || null,
        actionLogs: Array.isArray(data?.actionLogs) ? data.actionLogs : [],
    };
}

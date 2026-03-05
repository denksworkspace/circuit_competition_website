// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
const forceRemoteApiInDev = String(import.meta.env.VITE_FORCE_REMOTE_API || "").trim() === "1";
const useLocalApiInDev = Boolean(import.meta.env.DEV) && !forceRemoteApiInDev;

const apiBaseUrl = useLocalApiInDev
    ? ""
    : String(import.meta.env.VITE_API_BASE_URL || "")
        .trim()
        .replace(/\/+$/, "");
const directApiBaseUrl = useLocalApiInDev
    ? ""
    : String(import.meta.env.VITE_DIRECT_API_BASE_URL || "")
        .trim()
        .replace(/\/+$/, "");

function apiUrl(path) {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    if (!apiBaseUrl) return normalizedPath;
    return `${apiBaseUrl}${normalizedPath}`;
}

function directApiUrl(path) {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    if (!directApiBaseUrl) return normalizedPath;
    return `${directApiBaseUrl}${normalizedPath}`;
}

async function parseJsonSafe(response) {
    return response.json().catch(() => null);
}

function parseAttachmentName(contentDispositionRaw, fallbackName) {
    const contentDisposition = String(contentDispositionRaw || "");
    const utfMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utfMatch?.[1]) {
        try {
            return decodeURIComponent(utfMatch[1]);
        } catch {
            // Fallback to other parsing below.
        }
    }
    const plainMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
    if (plainMatch?.[1]) return plainMatch[1];
    return fallbackName;
}

async function fetchDownloadFile(path, { authKey, fallbackName, progressToken = "", signal = undefined, queryParams = null }) {
    const query = new URLSearchParams({ authKey: String(authKey || "") });
    if (String(progressToken || "").trim()) {
        query.set("progressToken", String(progressToken).trim());
    }
    if (queryParams && typeof queryParams === "object") {
        for (const [key, value] of Object.entries(queryParams)) {
            if (value == null) continue;
            query.set(String(key), String(value));
        }
    }
    const response = await fetch(apiUrl(`${path}?${query.toString()}`), { signal });
    if (!response.ok) {
        const data = await parseJsonSafe(response);
        throw new Error(data?.error || "Download failed.");
    }
    const blob = await response.blob();
    const fileName = parseAttachmentName(response.headers.get("Content-Disposition"), fallbackName);
    return { blob, fileName };
}

export async function fetchCommands() {
    const response = await fetch(apiUrl("/api/commands"));
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.error || "Failed to load commands.");
    }
    return Array.isArray(data?.commands) ? data.commands : [];
}

export async function fetchCommandByAuthKey(authKey) {
    const response = await fetch(apiUrl("/api/auth"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authKey }),
    });

    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.error || "Invalid key.");
    }

    return data?.command || null;
}

export async function fetchPoints() {
    const response = await fetch(apiUrl("/api/points"));
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.error || "Failed to load points.");
    }
    return Array.isArray(data?.points) ? data.points : [];
}

export async function requestUploadUrl({ authKey, fileName, fileSize, batchSize = 1, signal }) {
    const response = await fetch(apiUrl("/api/points-upload-url"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({ authKey, fileName, fileSize, batchSize }),
    });

    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.error || "Failed to get upload URL.");
    }
    return data;
}

export async function requestUploadUrlDirect({ authKey, fileName, fileSize, batchSize = 1 }) {
    const response = await fetch(directApiUrl("/api/points-upload-url-direct"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authKey, fileName, fileSize, batchSize }),
    });

    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.error || "Failed to get upload URL.");
    }
    return data;
}

export async function savePoint(pointPayload, { signal } = {}) {
    const response = await fetch(apiUrl("/api/points"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify(pointPayload),
    });

    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.error || "Failed to save point.");
    }

    return {
        point: data?.point || null,
        quota: data?.quota || null,
    };
}

export async function savePointDirect(pointPayload) {
    const response = await fetch(directApiUrl("/api/points-direct"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pointPayload),
    });

    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.error || "Failed to save point.");
    }

    return {
        point: data?.point || null,
        quota: data?.quota || null,
    };
}

export async function validateUploadCircuits({ authKey, files, timeoutSeconds, signal }) {
    const response = await fetch(apiUrl("/api/points-validate-upload"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({ authKey, files, timeoutSeconds }),
    });

    const data = await parseJsonSafe(response);
    if (!response.ok) {
        const details = Array.isArray(data?.files) ? data.files : [];
        const error = new Error(data?.error || "Circuit validation failed.");
        error.details = details;
        throw error;
    }

    return {
        files: Array.isArray(data?.files) ? data.files : [],
    };
}

export async function testPointCircuit({ authKey, benchmark, fileName, circuitText }) {
    const response = await fetch(apiUrl("/api/points-test"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            authKey,
            benchmark,
            fileName,
            circuitText,
        }),
    });

    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.error || "Failed to run CEC.");
    }

    return {
        equivalent: Boolean(data?.equivalent),
        output: String(data?.output || ""),
    };
}

export async function verifyPointCircuit({
    authKey,
    benchmark,
    circuitText,
    pointId,
    applyStatus,
    checkerVersion,
    timeoutSeconds,
    signal,
    progressToken,
}) {
    const response = await fetch(apiUrl("/api/points-verify"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
            authKey,
            benchmark,
            circuitText,
            pointId,
            applyStatus,
            checkerVersion,
            timeoutSeconds,
            progressToken,
        }),
    });

    const data = await parseJsonSafe(response);
    if (!response.ok) {
        const error = new Error(data?.error || "Failed to verify point.");
        error.code = data?.code || null;
        throw error;
    }
    return data;
}

export async function checkPointDuplicate({
    authKey,
    benchmark,
    delay,
    area,
    circuitText,
    signal,
}) {
    const response = await fetch(apiUrl("/api/points-duplicate-check"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
            authKey,
            benchmark,
            delay,
            area,
            circuitText,
        }),
    });
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        const error = new Error(data?.error || "Failed to check duplicate point.");
        error.code = data?.code || null;
        throw error;
    }
    return {
        duplicate: Boolean(data?.duplicate),
        point: data?.point || null,
    };
}

export async function fetchVerifyPointProgress({ token, signal }) {
    const query = new URLSearchParams({ token: String(token || "") });
    const response = await fetch(apiUrl(`/api/points-verify-progress?${query.toString()}`), { signal });
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        const error = new Error(data?.error || "Failed to fetch verify progress.");
        error.code = response.status;
        throw error;
    }
    return {
        ok: Boolean(data?.ok),
        status: String(data?.status || "queued"),
        done: Boolean(data?.done),
        error: data?.error ? String(data.error) : null,
        doneCount: Number(data?.doneCount || 0),
        totalCount: Number(data?.totalCount || 0),
        currentFileName: String(data?.currentFileName || ""),
        updatedAt: Number(data?.updatedAt || Date.now()),
    };
}

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

export async function planTruthTablesUpload({ authKey, fileNames }) {
    const response = await fetch(apiUrl("/api/truth-tables-plan"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authKey, fileNames }),
    });
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.error || "Failed to prepare truth upload.");
    }
    return {
        files: Array.isArray(data?.files) ? data.files : [],
    };
}

export async function requestTruthUploadUrl({ authKey, fileName, fileSize, batchSize = 1 }) {
    const response = await fetch(apiUrl("/api/truth-upload-url"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authKey, fileName, fileSize, batchSize }),
    });
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.error || "Failed to get truth upload URL.");
    }
    return data;
}

export async function saveTruthTable({ authKey, fileName, fileSize, batchSize = 1, allowReplace, allowCreateBenchmark }) {
    const response = await fetch(apiUrl("/api/truth-tables"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authKey, fileName, fileSize, batchSize, allowReplace, allowCreateBenchmark }),
    });
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        const error = new Error(data?.error || "Failed to save truth table.");
        error.code = data?.code || null;
        error.details = data || null;
        throw error;
    }
    return data;
}

export async function deletePoint({ id, authKey }) {
    const response = await fetch(apiUrl("/api/points"), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, authKey }),
    });

    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.error || "Failed to delete point.");
    }

    return data;
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

export async function exportAdminSchemesZip({
    authKey,
    progressToken = "",
    signal = undefined,
    scope = "all",
    verdictScope = "verify",
}) {
    const query = new URLSearchParams({ authKey: String(authKey || "") });
    if (String(progressToken || "").trim()) {
        query.set("progressToken", String(progressToken).trim());
    }
    query.set("scope", String(scope || "all"));
    query.set("verdictScope", String(verdictScope || "verify"));

    const response = await fetch(apiUrl(`/api/admin-export-schemes-zip?${query.toString()}`), { signal });
    if (!response.ok) {
        const data = await parseJsonSafe(response);
        throw new Error(data?.error || "Download failed.");
    }

    const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
    if (contentType.includes("application/json")) {
        const data = await parseJsonSafe(response);
        return {
            mode: String(data?.mode || "local_files"),
            exportDir: String(data?.exportDir || ""),
            savedFiles: Number(data?.savedFiles || 0),
            skippedAlreadyExported: Number(data?.skippedAlreadyExported || 0),
            errors: Array.isArray(data?.errors) ? data.errors : [],
        };
    }

    const blob = await response.blob();
    const fileName = parseAttachmentName(response.headers.get("Content-Disposition"), "schemes-export.zip");
    return { mode: "zip", blob, fileName };
}

export async function exportAdminDatabase({ authKey, progressToken = "", signal = undefined }) {
    return fetchDownloadFile("/api/admin-export-db", {
        authKey,
        progressToken,
        signal,
        fallbackName: "database-export.sql",
    });
}

export async function fetchAdminExportProgress({ token, signal }) {
    const query = new URLSearchParams({ token: String(token || "") });
    const response = await fetch(apiUrl(`/api/admin-export-progress?${query.toString()}`), { signal });
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        const error = new Error(data?.error || "Failed to fetch export progress.");
        error.code = response.status;
        throw error;
    }
    return data;
}

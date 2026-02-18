// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
async function parseJsonSafe(response) {
    return response.json().catch(() => null);
}

export async function fetchCommands() {
    const response = await fetch("/api/commands");
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.error || "Failed to load commands.");
    }
    return Array.isArray(data?.commands) ? data.commands : [];
}

export async function fetchCommandByAuthKey(authKey) {
    const response = await fetch("/api/auth", {
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
    const response = await fetch("/api/points");
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.error || "Failed to load points.");
    }
    return Array.isArray(data?.points) ? data.points : [];
}

export async function requestUploadUrl({ authKey, fileName, fileSize, batchSize = 1 }) {
    const response = await fetch("/api/points-upload-url", {
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

export async function savePoint(pointPayload) {
    const response = await fetch("/api/points", {
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

export async function validateUploadCircuits({ authKey, files }) {
    const response = await fetch("/api/points-validate-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authKey, files }),
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
    const response = await fetch("/api/points-test", {
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

export async function verifyPointCircuit({ authKey, benchmark, circuitText, pointId, applyStatus, checkerVersion }) {
    const response = await fetch("/api/points-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            authKey,
            benchmark,
            circuitText,
            pointId,
            applyStatus,
            checkerVersion,
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

export async function runAdminBulkVerify({ authKey, checkerVersion }) {
    const response = await fetch("/api/admin-points-verify", {
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

export async function runAdminBulkVerifyPoint({ authKey, checkerVersion, pointId }) {
    const response = await fetch("/api/admin-points-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authKey, checkerVersion, pointId }),
    });
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.error || "Failed to verify point.");
    }
    const log = Array.isArray(data?.log) ? data.log : [];
    return log[0] || null;
}

export async function applyAdminPointStatuses({ authKey, updates, checkerVersion }) {
    const response = await fetch("/api/admin-points-apply", {
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
    const response = await fetch("/api/admin-points-audit", {
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

export async function runAdminMetricsAuditPoint({ authKey, pointId }) {
    const response = await fetch("/api/admin-points-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authKey, pointId }),
    });
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.error || "Failed to audit point.");
    }
    const mismatches = Array.isArray(data?.mismatches) ? data.mismatches : [];
    return mismatches[0] || null;
}

export async function planTruthTablesUpload({ authKey, fileNames }) {
    const response = await fetch("/api/truth-tables-plan", {
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

export async function requestTruthUploadUrl({ authKey, fileName, fileSize }) {
    const response = await fetch("/api/truth-upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authKey, fileName, fileSize }),
    });
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.error || "Failed to get truth upload URL.");
    }
    return data;
}

export async function saveTruthTable({ authKey, fileName, allowReplace, allowCreateBenchmark }) {
    const response = await fetch("/api/truth-tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authKey, fileName, allowReplace, allowCreateBenchmark }),
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
    const response = await fetch("/api/points", {
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

    const response = await fetch(`/api/admin-users?${query.toString()}`);
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.error || "Failed to load user.");
    }

    return {
        user: data?.user || null,
        actionLogs: Array.isArray(data?.actionLogs) ? data.actionLogs : [],
    };
}

export async function updateAdminUserUploadSettings({
    authKey,
    userId,
    maxSingleUploadGb,
    totalUploadQuotaGb,
    maxMultiFileBatchCount,
}) {
    const response = await fetch("/api/admin-users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            authKey,
            userId,
            maxSingleUploadGb,
            totalUploadQuotaGb,
            maxMultiFileBatchCount,
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

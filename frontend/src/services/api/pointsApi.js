import { apiUrl, fetchDownloadFile, parseJsonSafe } from "../http/client.js";

export async function fetchPoints(authKey) {
    const query = new URLSearchParams();
    query.set("authKey", String(authKey || "").trim());
    const response = await fetch(apiUrl(`/api/points?${query.toString()}`));
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.error || "Failed to load points.");
    }
    return Array.isArray(data?.points) ? data.points : [];
}

export async function fetchParetoExportStatus(authKey) {
    const query = new URLSearchParams();
    query.set("authKey", String(authKey || "").trim());
    const response = await fetch(apiUrl(`/api/pareto-export-status?${query.toString()}`), { cache: "no-store" });
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.error || "Failed to load Pareto export status.");
    }
    return {
        hasNewPareto: Boolean(data?.hasNewPareto),
        lastParetoExportAt: data?.lastParetoExportAt || null,
    };
}

export async function downloadPointCircuitFile({ authKey, pointId, signal }) {
    return fetchDownloadFile("/api/points-download", {
        authKey,
        signal,
        fallbackName: "circuit.bench",
        queryParams: {
            pointId: String(pointId || "").trim(),
        },
    });
}

export async function exportParetoPointsZip({
    authKey,
    mode = "all_new",
    fromDate = "",
    bench = "all",
    paretoOnly = true,
    includedStatuses = [],
    signal = undefined,
}) {
    const normalizedStatuses = Array.isArray(includedStatuses)
        ? includedStatuses
            .map((status) => String(status || "").trim().toLowerCase())
            .filter(Boolean)
        : [];
    return fetchDownloadFile("/api/pareto-points-export", {
        authKey,
        signal,
        fallbackName: "pareto-points-export.zip",
        queryParams: {
            mode: String(mode || "all_new"),
            fromDate: String(fromDate || ""),
            bench: String(bench || "all"),
            paretoOnly: paretoOnly ? "1" : "0",
            includedStatuses: normalizedStatuses.join(","),
        },
    });
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

export async function createPointsUploadRequest({
    authKey,
    files,
    description,
    selectedParser,
    selectedChecker,
    parserTimeoutSeconds,
    checkerTimeoutSeconds,
    signal,
}) {
    const response = await fetch(apiUrl("/api/points-upload-request-create"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
            authKey,
            files,
            description,
            selectedParser,
            selectedChecker,
            parserTimeoutSeconds,
            checkerTimeoutSeconds,
        }),
    });
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.error || "Failed to create upload request.");
    }
    return {
        request: data?.request || null,
        files: Array.isArray(data?.files) ? data.files : [],
    };
}

export async function fetchActivePointsUploadRequest({ authKey, signal }) {
    const query = new URLSearchParams();
    query.set("authKey", String(authKey || "").trim());
    const response = await fetch(apiUrl(`/api/points-upload-request-active?${query.toString()}`), {
        signal,
        cache: "no-store",
    });
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.error || "Failed to fetch active upload request.");
    }
    return {
        request: data?.request || null,
        files: Array.isArray(data?.files) ? data.files : [],
    };
}

export async function fetchPointsUploadRequestStatus({ authKey, requestId, signal }) {
    const query = new URLSearchParams();
    query.set("authKey", String(authKey || "").trim());
    query.set("requestId", String(requestId || "").trim());
    const response = await fetch(apiUrl(`/api/points-upload-request-status?${query.toString()}`), {
        signal,
        cache: "no-store",
    });
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        const error = new Error(data?.error || "Failed to fetch upload request status.");
        error.code = response.status;
        throw error;
    }
    return {
        request: data?.request || null,
        files: Array.isArray(data?.files) ? data.files : [],
    };
}

export async function runPointsUploadRequest({ authKey, requestId, signal }) {
    const response = await fetch(apiUrl("/api/points-upload-request-run"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
            authKey,
            requestId,
        }),
    });
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.error || "Failed to run upload request.");
    }
    return {
        request: data?.request || null,
        files: Array.isArray(data?.files) ? data.files : [],
    };
}

export async function stopPointsUploadRequest({ authKey, requestId, signal }) {
    const response = await fetch(apiUrl("/api/points-upload-request-stop"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
            authKey,
            requestId,
        }),
    });
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.error || "Failed to stop upload request.");
    }
    return {
        request: data?.request || null,
        files: Array.isArray(data?.files) ? data.files : [],
    };
}

export async function applyPointsUploadRequestFiles({ authKey, requestId, fileIds, signal }) {
    const response = await fetch(apiUrl("/api/points-upload-request-apply"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
            authKey,
            requestId,
            fileIds,
        }),
    });
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.error || "Failed to apply upload request files.");
    }
    return {
        request: data?.request || null,
        files: Array.isArray(data?.files) ? data.files : [],
        savedPoints: Array.isArray(data?.savedPoints) ? data.savedPoints : [],
        errors: Array.isArray(data?.errors) ? data.errors : [],
    };
}

export async function closePointsUploadRequest({ authKey, requestId, signal }) {
    const response = await fetch(apiUrl("/api/points-upload-request-close"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
            authKey,
            requestId,
        }),
    });
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.error || "Failed to close upload request.");
    }
    return {
        request: data?.request || null,
        files: Array.isArray(data?.files) ? data.files : [],
    };
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

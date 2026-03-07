import { apiUrl, directApiUrl, parseJsonSafe } from "../http/client.js";

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

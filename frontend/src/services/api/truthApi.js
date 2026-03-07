import { apiUrl, parseJsonSafe } from "../http/client.js";

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

import { apiUrl, parseJsonSafe } from "../http/client.js";

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

import { apiUrl, fetchDownloadFile, parseAttachmentName, parseJsonSafe } from "../http/client.js";

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

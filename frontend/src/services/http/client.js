const forceRemoteApiInDev = String(import.meta.env.VITE_FORCE_REMOTE_API || "").trim() === "1";
const useLocalApiInDev = Boolean(import.meta.env.DEV) && !forceRemoteApiInDev;

const apiBaseUrl = useLocalApiInDev
    ? ""
    : String(import.meta.env.VITE_API_BASE_URL || "")
        .trim()
        .replace(/\/+$/, "");

export function apiUrl(path) {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    if (!apiBaseUrl) return normalizedPath;
    return `${apiBaseUrl}${normalizedPath}`;
}

export async function parseJsonSafe(response) {
    return response.json().catch(() => null);
}

export function parseAttachmentName(contentDispositionRaw, fallbackName) {
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

export async function fetchDownloadFile(path, { authKey, fallbackName, progressToken = "", signal = undefined, queryParams = null }) {
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

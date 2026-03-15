import { apiUrl, parseJsonSafe } from "../http/client.js";

export async function fetchCommands(authKey) {
    const query = new URLSearchParams();
    query.set("authKey", String(authKey || "").trim());
    const response = await fetch(apiUrl(`/api/commands?${query.toString()}`));
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

export async function fetchMaintenanceStatus({ authKey = "" } = {}) {
    const query = new URLSearchParams();
    if (String(authKey || "").trim()) query.set("authKey", String(authKey).trim());
    const response = await fetch(apiUrl(`/api/maintenance-status?${query.toString()}`));
    const data = await parseJsonSafe(response);
    if (!response.ok) {
        throw new Error(data?.error || "Failed to load maintenance status.");
    }
    return data?.maintenance || {
        enabled: false,
        activeForUser: false,
        bypass: false,
        message: "",
    };
}

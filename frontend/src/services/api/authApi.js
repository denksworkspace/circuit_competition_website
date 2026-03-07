import { apiUrl, parseJsonSafe } from "../http/client.js";

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

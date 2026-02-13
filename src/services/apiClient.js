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

export async function requestUploadUrl({ authKey, fileName, fileSize }) {
    const response = await fetch("/api/points-upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authKey, fileName, fileSize }),
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
}) {
    const response = await fetch("/api/admin-users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            authKey,
            userId,
            maxSingleUploadGb,
            totalUploadQuotaGb,
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

export function formatPointCreatedAt(createdAtRaw) {
    if (!createdAtRaw) return "unknown";
    const date = new Date(createdAtRaw);
    if (Number.isNaN(date.getTime())) return "unknown";
    return date.toLocaleString();
}

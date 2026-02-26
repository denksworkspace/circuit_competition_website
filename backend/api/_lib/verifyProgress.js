// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.

const progressByToken = new Map();
const TTL_MS = 10 * 60 * 1000;

function nowMs() {
    return Date.now();
}

function cleanupExpired() {
    const threshold = nowMs() - TTL_MS;
    for (const [token, row] of progressByToken.entries()) {
        if (Number(row?.updatedAt || 0) < threshold) {
            progressByToken.delete(token);
        }
    }
}

export function setVerifyProgress(tokenRaw, patch) {
    const token = String(tokenRaw || "").trim();
    if (!token) return;
    cleanupExpired();
    const prev = progressByToken.get(token) || {};
    progressByToken.set(token, {
        ...prev,
        ...patch,
        updatedAt: nowMs(),
    });
}

export function getVerifyProgress(tokenRaw) {
    const token = String(tokenRaw || "").trim();
    if (!token) return null;
    cleanupExpired();
    const row = progressByToken.get(token);
    if (!row) return null;
    return { ...row };
}

export function clearVerifyProgress(tokenRaw) {
    const token = String(tokenRaw || "").trim();
    if (!token) return;
    progressByToken.delete(token);
}

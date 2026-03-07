export function createProgressStore({ ttlMs = 10 * 60 * 1000 } = {}) {
    const progressByToken = new Map();

    function nowMs() {
        return Date.now();
    }

    function cleanupExpired() {
        const threshold = nowMs() - ttlMs;
        for (const [token, row] of progressByToken.entries()) {
            if (Number(row?.updatedAt || 0) < threshold) {
                progressByToken.delete(token);
            }
        }
    }

    return {
        set(tokenRaw, patch) {
            const token = String(tokenRaw || "").trim();
            if (!token) return;
            cleanupExpired();
            const prev = progressByToken.get(token) || {};
            progressByToken.set(token, {
                ...prev,
                ...patch,
                updatedAt: nowMs(),
            });
        },
        get(tokenRaw) {
            const token = String(tokenRaw || "").trim();
            if (!token) return null;
            cleanupExpired();
            const row = progressByToken.get(token);
            if (!row) return null;
            return { ...row };
        },
        clear(tokenRaw) {
            const token = String(tokenRaw || "").trim();
            if (!token) return;
            progressByToken.delete(token);
        },
    };
}

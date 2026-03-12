const RETRYABLE_CODES = new Set([
    "ETIMEDOUT",
    "ECONNRESET",
    "ECONNREFUSED",
    "EAI_AGAIN",
    "ENETUNREACH",
    "UND_ERR_CONNECT_TIMEOUT",
]);

function getErrorChain(error) {
    const chain = [];
    let cursor = error;
    const seen = new Set();
    while (cursor && typeof cursor === "object" && !seen.has(cursor)) {
        chain.push(cursor);
        seen.add(cursor);
        cursor = cursor.cause;
    }
    return chain;
}

function hasRetryableCode(error) {
    const chain = getErrorChain(error);
    return chain.some((item) => RETRYABLE_CODES.has(String(item?.code || "").toUpperCase()));
}

function hasRetryableMessage(error) {
    const chain = getErrorChain(error);
    return chain.some((item) => {
        const message = String(item?.message || "").toLowerCase();
        return (
            message.includes("error connecting to database")
            || message.includes("fetch failed")
            || message.includes("connect timeout")
            || message.includes("timed out")
            || message.includes("connection terminated")
        );
    });
}

export function isRetryableDbError(error) {
    return hasRetryableCode(error) || hasRetryableMessage(error);
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withDbRetry(action, { retries = 2, baseDelayMs = 200 } = {}) {
    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            return await action();
        } catch (error) {
            lastError = error;
            if (!isRetryableDbError(error) || attempt >= retries) {
                throw error;
            }
            const delayMs = baseDelayMs * (attempt + 1);
            await sleep(delayMs);
        }
    }
    throw lastError;
}

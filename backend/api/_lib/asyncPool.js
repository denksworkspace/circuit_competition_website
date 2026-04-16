// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
export function readBoundedConcurrency(rawValue, fallback = 4, cap = 8) {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) return Math.max(1, Math.min(cap, fallback));
    return Math.max(1, Math.min(cap, Math.floor(parsed)));
}

export async function runAsyncPool(itemsRaw, concurrencyRaw, worker) {
    const items = Array.isArray(itemsRaw) ? itemsRaw : [];
    const concurrency = Math.max(1, Math.min(Number(concurrencyRaw) || 1, items.length || 1));
    let cursor = 0;
    const workers = Array.from({ length: concurrency }, () =>
        (async () => {
            while (cursor < items.length) {
                const index = cursor;
                cursor += 1;
                await worker(items[index], index);
            }
        })()
    );
    await Promise.all(workers);
}

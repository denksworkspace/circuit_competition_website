// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
function normalizePointRow(row) {
    const benchmark = String(row?.benchmark || "").trim();
    const delay = Number(row?.delay);
    const area = Number(row?.area);
    if (!benchmark || !Number.isFinite(delay) || !Number.isFinite(area)) return null;
    return {
        row,
        benchmark,
        delay: Math.trunc(delay),
        area: Number(area),
    };
}

export function selectParetoRows(rowsRaw) {
    const rows = Array.isArray(rowsRaw) ? rowsRaw : [];
    const rowsByBenchmark = new Map();
    for (const rawRow of rows) {
        const normalized = normalizePointRow(rawRow);
        if (!normalized) continue;
        if (!rowsByBenchmark.has(normalized.benchmark)) rowsByBenchmark.set(normalized.benchmark, []);
        rowsByBenchmark.get(normalized.benchmark).push(normalized);
    }

    const selected = [];
    for (const bucket of rowsByBenchmark.values()) {
        bucket.sort((lhs, rhs) => {
            if (lhs.delay !== rhs.delay) return lhs.delay - rhs.delay;
            return lhs.area - rhs.area;
        });
        let bestArea = Infinity;
        for (const item of bucket) {
            if (item.area < bestArea) {
                selected.push(item.row);
                bestArea = item.area;
            }
        }
    }

    return selected;
}

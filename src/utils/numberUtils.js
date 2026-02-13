export function clamp(value, lo, hi) {
    return Math.min(hi, Math.max(lo, value));
}

export function formatIntNoGrouping(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "";
    return Math.trunc(n).toLocaleString("en-US", { useGrouping: false });
}

export function parsePosIntCapped(str, maxValue) {
    if (str === "") return null;
    if (!/^\d+$/.test(str)) return null;
    const n = Number(str);
    if (!Number.isSafeInteger(n) || n < 1 || n > maxValue) return null;
    return n;
}

// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { clamp } from "./numberUtils.js";

export function randInt(lo, hiInclusive) {
    return lo + Math.floor(Math.random() * (hiInclusive - lo + 1));
}

export function randomChoice(arr) {
    return arr[randInt(0, arr.length - 1)];
}

function pickInt(lo, hi) {
    const min = Math.ceil(Math.min(lo, hi));
    const max = Math.floor(Math.max(lo, hi));
    if (min > max) return min;
    return min + Math.floor(Math.random() * (max - min + 1));
}

function pickAbove(minExclusive, maxInclusive) {
    const lo = Math.min(maxInclusive, minExclusive + 1);
    const hi = maxInclusive;
    if (lo > hi) return hi;
    return pickInt(lo, hi);
}

export function chooseAreaSmartFromParetoFront(frontPoints, newDelay) {
    const sortedFront = [...frontPoints].sort((a, b) => a.delay - b.delay);

    let left = null;
    for (let i = sortedFront.length - 1; i >= 0; i -= 1) {
        if (sortedFront[i].delay < newDelay) {
            left = sortedFront[i];
            break;
        }
    }

    let right = null;
    for (let i = 0; i < sortedFront.length; i += 1) {
        if (sortedFront[i].delay > newDelay) {
            right = sortedFront[i];
            break;
        }
    }

    if (!left && !right) return pickInt(100, 1000);

    if (left && right) {
        const lo = Math.min(left.area, right.area);
        const hi = Math.max(left.area, right.area);

        if (Math.random() < 0.5) return pickInt(lo, hi);
        return pickAbove(hi, 1000);
    }

    const sideArea = left ? left.area : right.area;
    const capped = clamp(sideArea, 100, 1000);

    if (Math.random() < 0.5) return pickInt(100, capped);
    return pickAbove(capped, 1000);
}

// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import {
    BENCH_INPUT_NAME_RE,
    MAX_INPUT_FILENAME_LEN,
    MAX_VALUE,
    ROLE_ADMIN,
    ROLE_LEADER,
    USER_PALETTE,
} from "../constants/appConstants.js";
import { clamp } from "./numberUtils.js";

export function uid() {
    return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

export function buildAxis(maxValue, divisions, hardCap) {
    const max = clamp(Math.floor(maxValue), 1, hardCap);
    const div = Math.max(1, Math.floor(divisions));
    const step = Math.max(1, Math.ceil(max / div));

    let overflow = max + step;
    overflow = Math.min(overflow, hardCap);

    const ticks = [0];
    for (let value = step; value < max; value += step) ticks.push(value);
    if (ticks[ticks.length - 1] !== max) ticks.push(max);
    if (ticks[ticks.length - 1] !== overflow) ticks.push(overflow);

    return { max, step, overflow, ticks };
}

export function computePlottedPoint(point, delayMax, areaMax, delayStep, areaStep, delayOverflowLane, areaOverflowLane) {
    const outsideDelay = Math.max(0, point.delay - delayMax);
    const outsideArea = Math.max(0, point.area - areaMax);
    const isClipped = outsideDelay > 0 || outsideArea > 0;

    const baseRadius = 4;
    const minRadius = 2.8;
    const delayNorm = outsideDelay / Math.max(1, delayStep * 3);
    const areaNorm = outsideArea / Math.max(1, areaStep * 3);
    const normalizedDistance = Math.hypot(delayNorm, areaNorm);
    const radius = isClipped ? clamp(baseRadius - normalizedDistance * 0.55, minRadius, baseRadius) : baseRadius;

    return {
        ...point,
        delayDisp: point.delay > delayMax ? delayOverflowLane : point.delay,
        areaDisp: point.area > areaMax ? areaOverflowLane : point.area,
        isClipped,
        radius,
    };
}

export function statusColor(status) {
    if (status === "verified") return "#16a34a";
    if (status === "failed") return "#dc2626";
    return "#2563eb";
}

function hashString(str) {
    let hash = 2166136261;
    for (let index = 0; index < str.length; index += 1) {
        hash ^= str.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function userColor(sender) {
    const idx = hashString(sender || "unknown") % USER_PALETTE.length;
    return USER_PALETTE[idx];
}

export function commandColor(sender, commandByName) {
    const senderName = String(sender || "");
    const testMatch = senderName.match(/^test_command(\d+)$/);
    if (testMatch) {
        const mapped = `command${testMatch[1]}`;
        const mappedCommand = commandByName.get(mapped);
        if (mappedCommand) return mappedCommand.color;
        return userColor(mapped);
    }

    const command = commandByName.get(senderName);
    if (command) return command.color;
    return userColor(senderName);
}

function sanitizeFileToken(value) {
    return (
        String(value || "")
            .trim()
            .replace(/[^A-Za-z0-9-]+/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "") || "x"
    );
}

export function buildStoredFileName({ benchmark, delay, area, pointId, sender }) {
    return `bench${benchmark}_${delay}_${area}_${sanitizeFileToken(sender)}_${sanitizeFileToken(pointId)}.bench`;
}

export function getRoleLabel(role) {
    if (role === ROLE_ADMIN) return "admin";
    if (role === ROLE_LEADER) return "leader";
    return "participant";
}

export function parseBenchFileName(fileNameRaw) {
    const fileName = (fileNameRaw || "").trim();
    if (!fileName) return { ok: false, error: "Empty file name." };
    if (fileName.length > MAX_INPUT_FILENAME_LEN) {
        return {
            ok: false,
            error: `File name is too long (max ${MAX_INPUT_FILENAME_LEN}).`,
        };
    }

    const match = fileName.match(BENCH_INPUT_NAME_RE);
    if (!match) {
        return {
            ok: false,
            error: "Invalid file name pattern. Expected: bench{200..299}_<delay>_<area>.bench or ex{200..299}_<delay>_<area>.bench",
        };
    }

    const benchmark = Number(match[2]);
    const delay = Number(match[3]);
    const area = Number(match[4]);

    if (!Number.isSafeInteger(benchmark) || benchmark < 200 || benchmark > 299) {
        return { ok: false, error: "Benchmark must be in [200..299]." };
    }
    if (!Number.isSafeInteger(delay) || delay < 0 || delay > MAX_VALUE) {
        return { ok: false, error: "Delay must be an integer in [0..10^9]." };
    }
    if (!Number.isSafeInteger(area) || area < 0 || area > MAX_VALUE) {
        return { ok: false, error: "Area must be an integer in [0..10^9]." };
    }

    return {
        ok: true,
        benchmark,
        delay,
        area,
        normalizedFileName: `bench${benchmark}_${delay}_${area}.bench`,
    };
}

export function computeParetoFrontOriginal(points) {
    const sorted = [...points].sort((a, b) => {
        if (a.delay !== b.delay) return a.delay - b.delay;
        return a.area - b.area;
    });

    const front = [];
    let bestArea = Infinity;

    for (const point of sorted) {
        if (point.area < bestArea) {
            front.push(point);
            bestArea = point.area;
        }
    }

    return front;
}

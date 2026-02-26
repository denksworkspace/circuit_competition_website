// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { describe, expect, it } from "vitest";
import {
    buildAxis,
    buildStoredFileName,
    commandColor,
    computeParetoFrontOriginal,
    computePlottedPoint,
    getRoleLabel,
    parseBenchFileName,
    statusColor,
    uid,
} from "../../src/utils/pointUtils.js";

describe("pointUtils", () => {
    it("uid returns non-empty unique-ish values", () => {
        const first = uid();
        const second = uid();
        expect(first).toBeTypeOf("string");
        expect(second).toBeTypeOf("string");
        expect(first.length).toBeGreaterThan(0);
        expect(first).not.toBe(second);
    });

    it("buildAxis creates ticks and overflow inside hard cap", () => {
        const axis = buildAxis(53, 10, 1_000_000_000);
        expect(axis.max).toBe(53);
        expect(axis.step).toBe(6);
        expect(axis.overflow).toBe(59);
        expect(axis.ticks[0]).toBe(0);
        expect(axis.ticks.at(-1)).toBe(axis.overflow);
    });

    it("buildAxis clamps minimum and hard cap", () => {
        const minAxis = buildAxis(0, 0, 100);
        expect(minAxis.max).toBe(1);
        expect(minAxis.step).toBe(1);
        const capped = buildAxis(101, 10, 100);
        expect(capped.max).toBe(100);
        expect(capped.overflow).toBe(100);
    });

    it("computePlottedPoint keeps in-range points untouched", () => {
        const point = { delay: 20, area: 40 };
        const plotted = computePlottedPoint(point, 50, 100, 10, 10, 60, 110);
        expect(plotted.delayDisp).toBe(20);
        expect(plotted.areaDisp).toBe(40);
        expect(plotted.isClipped).toBe(false);
        expect(plotted.radius).toBe(4);
    });

    it("computePlottedPoint maps clipped points to overflow lanes", () => {
        const point = { delay: 80, area: 140 };
        const plotted = computePlottedPoint(point, 50, 100, 10, 10, 60, 110);
        expect(plotted.delayDisp).toBe(60);
        expect(plotted.areaDisp).toBe(110);
        expect(plotted.isClipped).toBe(true);
        expect(plotted.radius).toBeGreaterThanOrEqual(2.8);
        expect(plotted.radius).toBeLessThan(4);
    });

    it("statusColor returns expected palette", () => {
        expect(statusColor("verified")).toBe("#16a34a");
        expect(statusColor("failed")).toBe("#dc2626");
        expect(statusColor("anything")).toBe("#2563eb");
    });

    it("commandColor prefers command map and handles test sender mapping", () => {
        const commandByName = new Map([
            ["alice", { color: "#111111" }],
            ["command7", { color: "#222222" }],
        ]);

        expect(commandColor("alice", commandByName)).toBe("#111111");
        expect(commandColor("test_command7", commandByName)).toBe("#222222");
        expect(commandColor("unknown", commandByName)).toMatch(/^#/);
    });

    it("buildStoredFileName sanitizes sender and point tokens", () => {
        const fileName = buildStoredFileName({
            benchmark: 254,
            delay: 10,
            area: 20,
            sender: " team @ one ",
            pointId: " p/1 ",
        });

        expect(fileName).toBe("bench254_10_20_team-one_p-1.bench");
    });

    it("getRoleLabel maps unknown role to participant", () => {
        expect(getRoleLabel("admin")).toBe("admin");
        expect(getRoleLabel("leader")).toBe("leader");
        expect(getRoleLabel("random")).toBe("participant");
    });

    it("parseBenchFileName validates format and bounds", () => {
        expect(parseBenchFileName("bench200_0_0.bench")).toEqual({
            ok: true,
            benchmark: 200,
            delay: 0,
            area: 0,
            normalizedFileName: "bench200_0_0.bench",
        });
        expect(parseBenchFileName("bench299_100_100.bench").ok).toBe(true);
        expect(parseBenchFileName("ex254_10_20.bench")).toEqual({
            ok: true,
            benchmark: 254,
            delay: 10,
            area: 20,
            normalizedFileName: "bench254_10_20.bench",
        });

        expect(parseBenchFileName(" ").ok).toBe(false);
        expect(parseBenchFileName("bench199_1_1").ok).toBe(false);
        expect(parseBenchFileName("bench200_0_0").ok).toBe(false);
        expect(parseBenchFileName("bench300_1_1").ok).toBe(false);
        expect(parseBenchFileName("bench200_-1_1").ok).toBe(false);
        expect(parseBenchFileName("bench200_1_1000000001").ok).toBe(false);
        expect(parseBenchFileName(`bench200_1_1_${"x".repeat(90)}`).ok).toBe(false);
    });

    it("computeParetoFrontOriginal builds monotonic area front", () => {
        const points = [
            { id: "a", delay: 10, area: 200 },
            { id: "b", delay: 10, area: 150 },
            { id: "c", delay: 20, area: 160 },
            { id: "d", delay: 30, area: 140 },
            { id: "e", delay: 40, area: 170 },
        ];

        const front = computeParetoFrontOriginal(points);
        expect(front.map((p) => p.id)).toEqual(["b", "d"]);
    });
});

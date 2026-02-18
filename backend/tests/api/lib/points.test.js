// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { describe, expect, it, vi } from "vitest";

async function importPointsLibWithEnv(domain) {
    process.env.CLOUDFRONT_DOMAIN = domain;
    vi.resetModules();
    return import("../../../api/_lib/points.js");
}

describe("api/_lib/points", () => {
    it("buildObjectKey prefixes path", async () => {
        const mod = await importPointsLibWithEnv("");
        expect(mod.buildObjectKey("file.bench")).toBe("points/file.bench");
    });

    it("buildDownloadUrl returns null when domain is absent", async () => {
        const mod = await importPointsLibWithEnv("");
        expect(mod.buildDownloadUrl("file.bench")).toBeNull();
    });

    it("buildDownloadUrl normalizes domain and encodes key", async () => {
        const mod = await importPointsLibWithEnv("https://cdn.example.com/");
        const url = mod.buildDownloadUrl("a b.bench");
        expect(url).toBe("https://cdn.example.com/points/a%20b.bench");
    });

    it("normalizePointRow maps DB row to API DTO", async () => {
        const mod = await importPointsLibWithEnv("cdn.example.com");
        const row = {
            id: "1",
            benchmark: "254",
            delay: "10",
            area: "20",
            description: "schema",
            sender: "team",
            file_name: "f.bench",
            status: "verified",
            checker_version: null,
        };

        const point = mod.normalizePointRow(row);
        expect(point.delay).toBe(10);
        expect(point.area).toBe(20);
        expect(point.fileName).toBe("f.bench");
        expect(point.hasTruth).toBe(false);
        expect(point.fileKey).toBe("points/f.bench");
        expect(point.downloadUrl).toBe("https://cdn.example.com/points/f.bench");
    });

    it("parseStoredBenchFileName validates and parses data", async () => {
        const mod = await importPointsLibWithEnv("");
        expect(mod.parseStoredBenchFileName(" ").ok).toBe(false);
        expect(mod.parseStoredBenchFileName("bench254_10_20_team_pid.bench")).toEqual({
            ok: true,
            fileName: "bench254_10_20_team_pid.bench",
            benchmark: "254",
            delay: 10,
            area: 20,
        });
        expect(mod.parseStoredBenchFileName("bench199_1_1_x_y.bench").ok).toBe(false);
    });
});

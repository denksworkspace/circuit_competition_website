// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vercel/postgres", () => ({ sql: vi.fn() }));
vi.mock("../../../api/_lib/s3Presign.js", () => ({
    buildPresignedPutUrl: vi.fn(({ objectKey }) => `https://upload.example/${encodeURIComponent(objectKey)}`),
}));
vi.mock("../../../api/_lib/pointsStatus.js", () => ({
    ensurePointsStatusConstraint: vi.fn(),
}));

import { sql } from "@vercel/postgres";
import {
    NON_VERIFIED_PARETO_OBJECT_KEY,
    VERIFIED_PARETO_OBJECT_KEY,
    syncParetoFilenameCsvs,
} from "../../../api/_lib/paretoFilenameSync.js";

describe("api/_lib/paretoFilenameSync", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.AWS_ACCESS_KEY_ID = "AKIA_TEST";
        process.env.AWS_SECRET_ACCESS_KEY = "SECRET_TEST";
        process.env.AWS_REGION = "us-east-1";
        process.env.S3_BUCKET = "my-bucket";
        global.fetch = vi.fn(async () => ({ ok: true }));
    });

    it("rewrites both tracked CSVs and ignores untracked statuses", async () => {
        sql
            .mockResolvedValueOnce({
                rows: [
                    { benchmark: "254", delay: 1, area: 5, file_name: "b.bench", created_at: "2026-03-24T00:00:00.000Z" },
                    { benchmark: "254", delay: 2, area: 4, file_name: "a.bench", created_at: "2026-03-24T00:00:01.000Z" },
                ],
            })
            .mockResolvedValueOnce({
                rows: [
                    { benchmark: "255", delay: 10, area: 20, file_name: "n2.bench", created_at: "2026-03-24T00:00:00.000Z" },
                    { benchmark: "255", delay: 10, area: 19, file_name: "n1.bench", created_at: "2026-03-24T00:00:01.000Z" },
                ],
            });

        await syncParetoFilenameCsvs({ statuses: ["verified", "failed", "non-verified"] });

        expect(global.fetch).toHaveBeenCalledTimes(2);
        expect(global.fetch.mock.calls[0][0]).toContain(encodeURIComponent(VERIFIED_PARETO_OBJECT_KEY));
        expect(global.fetch.mock.calls[1][0]).toContain(encodeURIComponent(NON_VERIFIED_PARETO_OBJECT_KEY));
        expect(global.fetch.mock.calls[0][1].body).toBe("a.bench\nb.bench\n");
        expect(global.fetch.mock.calls[1][1].body).toBe("n1.bench\n");
    });

    it("throws when AWS/S3 config is missing", async () => {
        process.env.S3_BUCKET = "";
        sql.mockResolvedValueOnce({ rows: [] });

        await expect(syncParetoFilenameCsvs({ statuses: ["verified"] }))
            .rejects
            .toThrow("S3 configuration is not complete.");
    });

    it("does nothing when statuses are not tracked", async () => {
        await syncParetoFilenameCsvs({ statuses: ["failed"] });
        expect(sql).not.toHaveBeenCalled();
        expect(global.fetch).not.toHaveBeenCalled();
    });
});


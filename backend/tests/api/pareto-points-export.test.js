// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockReq, createMockRes } from "../helpers/mockHttp.js";

vi.mock("@vercel/postgres", () => ({ sql: vi.fn() }));
vi.mock("../../api/_lib/pointsStatus.js", () => ({
    ensurePointsStatusConstraint: vi.fn(),
}));
vi.mock("../../api/_lib/commandUploadSettings.js", () => ({
    ensureCommandUploadSettingsSchema: vi.fn(),
}));
vi.mock("../../api/_lib/points.js", () => ({
    buildDownloadUrl: vi.fn((fileName) => `https://cdn.example/${fileName}`),
}));
vi.mock("../../api/_lib/zip.js", () => ({
    buildZipBuffer: vi.fn(() => Buffer.from("zip")),
}));

import { sql } from "@vercel/postgres";
import { buildZipBuffer } from "../../api/_lib/zip.js";
import handler from "../../api/pareto-points-export.js";

describe("api/pareto-points-export", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch = vi.fn(async () => ({
            ok: true,
            arrayBuffer: async () => Uint8Array.from([1, 2, 3, 4]).buffer,
        }));
    });

    it("validates fromDate for from_date mode", async () => {
        const req = createMockReq({
            method: "GET",
            query: {
                authKey: "k",
                mode: "from_date",
                fromDate: "bad",
            },
        });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(400);
    });

    it("rejects custom date outside last 7 days range", async () => {
        const req = createMockReq({
            method: "GET",
            query: {
                authKey: "k",
                mode: "from_date",
                fromDate: "2026-01-01",
            },
        });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({ error: "fromDate must be within the last 7 days (UTC)." });
    });

    it("returns zip and updates quota on success", async () => {
        sql.mockResolvedValueOnce({ rows: [{ id: 1, last_pareto_export_at: null }] }); // auth
        sql.mockResolvedValueOnce({
            rows: [
                { benchmark: "254", delay: 1, area: 4, file_name: "bench254_1_4_old.bench", created_at: "2026-03-22T10:00:00.000Z", status: "verified" },
                { benchmark: "254", delay: 1, area: 5, file_name: "bench254_1_5_a.bench", created_at: "2026-03-23T10:00:00.000Z", status: "verified" },
                { benchmark: "254", delay: 2, area: 7, file_name: "bench254_2_7_b.bench", created_at: "2026-03-23T11:00:00.000Z", status: "failed" },
            ],
        }); // points
        sql.mockResolvedValueOnce({ rows: [{ uploaded_bytes_total: 100, total_upload_quota_bytes: 1000 }] }); // quota update

        const req = createMockReq({
            method: "GET",
            query: {
                authKey: "k",
                mode: "all_new",
                bench: "all",
                paretoOnly: "0",
            },
        });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(global.fetch).toHaveBeenCalledTimes(2);
        expect(global.fetch).toHaveBeenCalledWith("https://cdn.example/bench254_1_5_a.bench", undefined);
        expect(global.fetch).toHaveBeenCalledWith("https://cdn.example/bench254_2_7_b.bench", undefined);
        expect(buildZipBuffer).toHaveBeenCalledTimes(1);
        const zipEntries = buildZipBuffer.mock.calls[0][0];
        expect(zipEntries.some((entry) => entry.name === "bench254_1_5_a.bench")).toBe(true);
        expect(zipEntries.some((entry) => entry.name === "bench254_2_7_b.bench")).toBe(true);
        expect(zipEntries.some((entry) => entry.name === "manifest.json")).toBe(true);
        expect(res.headers["Content-Type"]).toBe("application/zip");
        expect(res.headers["Content-Disposition"]).toContain("attachment;");
        expect(res.ended).toBe(true);
    });

    it("returns clear message when no new points are available", async () => {
        sql.mockResolvedValueOnce({ rows: [{ id: 1, last_pareto_export_at: "2026-03-24T10:00:00.000Z" }] }); // auth
        sql.mockResolvedValueOnce({
            rows: [
                { benchmark: "254", delay: 1, area: 5, file_name: "bench254_1_5_keep.bench", created_at: "2026-03-23T10:00:00.000Z", status: "verified" },
            ],
        }); // points

        const req = createMockReq({
            method: "GET",
            query: {
                authKey: "k",
                mode: "all_new",
                bench: "all",
                paretoOnly: "1",
            },
        });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(409);
        expect(res.body).toEqual({ error: "No new points to export." });
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it("exports only pareto points when paretoOnly=1", async () => {
        sql.mockResolvedValueOnce({ rows: [{ id: 1, last_pareto_export_at: null }] }); // auth
        sql.mockResolvedValueOnce({
            rows: [
                { benchmark: "254", delay: 1, area: 5, file_name: "bench254_1_5_keep.bench", created_at: "2026-03-23T10:00:00.000Z", status: "verified" },
                { benchmark: "254", delay: 2, area: 7, file_name: "bench254_2_7_drop.bench", created_at: "2026-03-23T11:00:00.000Z", status: "failed" },
            ],
        }); // points
        sql.mockResolvedValueOnce({ rows: [{ uploaded_bytes_total: 100, total_upload_quota_bytes: 1000 }] }); // quota update

        const req = createMockReq({
            method: "GET",
            query: {
                authKey: "k",
                mode: "all_new",
                bench: "all",
                paretoOnly: "1",
            },
        });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it("filters exported points by selected statuses", async () => {
        sql.mockResolvedValueOnce({ rows: [{ id: 1, last_pareto_export_at: null }] }); // auth
        sql.mockResolvedValueOnce({
            rows: [
                { benchmark: "254", delay: 1, area: 5, file_name: "bench254_1_5_verified.bench", created_at: "2026-03-23T10:00:00.000Z", status: "verified" },
                { benchmark: "254", delay: 2, area: 7, file_name: "bench254_2_7_failed.bench", created_at: "2026-03-23T11:00:00.000Z", status: "failed" },
            ],
        }); // points
        sql.mockResolvedValueOnce({ rows: [{ uploaded_bytes_total: 100, total_upload_quota_bytes: 1000 }] }); // quota update

        const req = createMockReq({
            method: "GET",
            query: {
                authKey: "k",
                mode: "all_new",
                bench: "all",
                paretoOnly: "0",
                includedStatuses: "verified",
            },
        });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(global.fetch).toHaveBeenCalledWith("https://cdn.example/bench254_1_5_verified.bench", undefined);
    });

    it("returns 413 when quota is exceeded", async () => {
        sql.mockResolvedValueOnce({ rows: [{ id: 1, last_pareto_export_at: null }] }); // auth
        sql.mockResolvedValueOnce({
            rows: [
                { benchmark: "254", delay: 1, area: 5, file_name: "bench254_1_5_keep.bench", created_at: "2026-03-23T10:00:00.000Z", status: "verified" },
            ],
        }); // points
        sql.mockResolvedValueOnce({ rows: [] }); // quota update fail

        const req = createMockReq({
            method: "GET",
            query: {
                authKey: "k",
                mode: "all_new",
                bench: "all",
                paretoOnly: "1",
            },
        });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(413);
    });
});

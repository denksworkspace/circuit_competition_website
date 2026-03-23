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

import { sql } from "@vercel/postgres";
import handler from "../../api/pareto-export-status.js";

describe("api/pareto-export-status", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("requires valid auth key", async () => {
        sql.mockResolvedValueOnce({ rows: [] });

        const req = createMockReq({ method: "GET", query: { authKey: "bad" } });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(401);
    });

    it("returns hasNewPareto=true when no export timestamp exists", async () => {
        sql.mockResolvedValueOnce({ rows: [{ id: 1, last_pareto_export_at: null }] });
        sql.mockResolvedValueOnce({
            rows: [
                { benchmark: "254", delay: 1, area: 5, created_at: "2026-03-23T10:00:00.000Z" },
                { benchmark: "254", delay: 2, area: 6, created_at: "2026-03-23T09:00:00.000Z" },
            ],
        });

        const req = createMockReq({ method: "GET", query: { authKey: "k" } });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.hasNewPareto).toBe(true);
    });

    it("returns hasNewPareto=false when front points are older than last export", async () => {
        sql.mockResolvedValueOnce({ rows: [{ id: 1, last_pareto_export_at: "2026-03-23T10:00:00.000Z" }] });
        sql.mockResolvedValueOnce({
            rows: [
                { benchmark: "254", delay: 1, area: 5, created_at: "2026-03-22T10:00:00.000Z" },
                { benchmark: "254", delay: 2, area: 6, created_at: "2026-03-22T09:00:00.000Z" },
            ],
        });

        const req = createMockReq({ method: "GET", query: { authKey: "k" } });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.hasNewPareto).toBe(false);
    });
});

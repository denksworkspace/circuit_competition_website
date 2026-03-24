// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockReq, createMockRes } from "../helpers/mockHttp.js";

vi.mock("@vercel/postgres", () => ({ sql: vi.fn() }));
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

    it("returns hasNewPareto=true when user flag is set", async () => {
        sql.mockResolvedValueOnce({ rows: [{ id: 1, last_pareto_export_at: null, has_new_pareto: true }] });

        const req = createMockReq({ method: "GET", query: { authKey: "k" } });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.hasNewPareto).toBe(true);
    });

    it("returns hasNewPareto=false when user flag is not set", async () => {
        sql.mockResolvedValueOnce({
            rows: [{ id: 1, last_pareto_export_at: "2026-03-23T10:00:00.000Z", has_new_pareto: false }],
        });

        const req = createMockReq({ method: "GET", query: { authKey: "k" } });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.hasNewPareto).toBe(false);
    });
});

// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockReq, createMockRes } from "../helpers/mockHttp.js";

vi.mock("@vercel/postgres", () => ({ sql: vi.fn() }));
vi.mock("../../api/_lib/pointsStatus.js", () => ({
    ensurePointsStatusConstraint: vi.fn(),
}));
vi.mock("../../api/_lib/points.js", () => ({
    buildDownloadUrl: vi.fn((fileName) => `https://cdn.example/${fileName}`),
}));

import { sql } from "@vercel/postgres";
import handler from "../../api/points-download.js";

describe("api/points-download", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch = vi.fn(async () => ({
            ok: true,
            arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
        }));
    });

    it("requires auth key", async () => {
        const req = createMockReq({ method: "GET", query: { pointId: "p1" } });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(401);
    });

    it("rejects invalid auth key", async () => {
        sql.mockResolvedValueOnce({ rows: [] });
        const req = createMockReq({ method: "GET", query: { authKey: "k", pointId: "p1" } });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(401);
    });

    it("returns 404 for missing point", async () => {
        sql.mockResolvedValueOnce({ rows: [{ id: 1 }] });
        sql.mockResolvedValueOnce({ rows: [] });
        const req = createMockReq({ method: "GET", query: { authKey: "k", pointId: "p1" } });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(404);
    });

    it("returns downloadable file", async () => {
        sql.mockResolvedValueOnce({ rows: [{ id: 1 }] });
        sql.mockResolvedValueOnce({ rows: [{ file_name: "bench254_1_2_team_x.bench" }] });

        const req = createMockReq({ method: "GET", query: { authKey: "k", pointId: "p1" } });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.headers["Content-Disposition"]).toContain("attachment;");
        expect(res.ended).toBe(true);
    });
});

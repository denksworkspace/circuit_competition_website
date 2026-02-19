// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockReq, createMockRes } from "../helpers/mockHttp.js";

vi.mock("@vercel/postgres", () => ({ sql: vi.fn() }));
vi.mock("../../api/_roles.js", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        ensureCommandRolesSchema: vi.fn(),
    };
});
vi.mock("../../api/_lib/commandUploadSettings.js", () => ({
    ensureCommandUploadSettingsSchema: vi.fn(),
}));
vi.mock("../../api/_lib/abc.js", () => ({
    getAigStatsFromBenchText: vi.fn(),
}));

import { sql } from "@vercel/postgres";
import { getAigStatsFromBenchText } from "../../api/_lib/abc.js";
import handler from "../../api/points-validate-upload.js";

describe("api/points-validate-upload", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("rejects missing auth key", async () => {
        const req = createMockReq({ method: "POST", body: { files: [] } });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(401);
    });

    it("rejects invalid auth key", async () => {
        sql.mockResolvedValueOnce({ rows: [] });
        const req = createMockReq({
            method: "POST",
            body: {
                authKey: "bad",
                files: [{ fileName: "bench254_10_20.bench", circuitText: "x" }],
            },
        });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(401);
    });

    it("returns 422 on area/depth mismatch", async () => {
        sql.mockResolvedValueOnce({ rows: [{ id: 1 }] });
        getAigStatsFromBenchText.mockResolvedValueOnce({
            ok: true,
            area: 99,
            depth: 77,
        });

        const req = createMockReq({
            method: "POST",
            body: {
                authKey: "ok",
                files: [{ fileName: "bench254_10_20.bench", circuitText: "x" }],
            },
        });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(422);
        expect(res.body.files[0].reason).toContain("Metric mismatch");
    });

    it("passes when metrics match filename", async () => {
        sql.mockResolvedValueOnce({ rows: [{ id: 1 }] });
        getAigStatsFromBenchText.mockResolvedValueOnce({
            ok: true,
            area: 20,
            depth: 10,
        });

        const req = createMockReq({
            method: "POST",
            body: {
                authKey: "ok",
                files: [{ fileName: "bench254_10_20.bench", circuitText: "x" }],
            },
        });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.files[0].ok).toBe(true);
    });
});

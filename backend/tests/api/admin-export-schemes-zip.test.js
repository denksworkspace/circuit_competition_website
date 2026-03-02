// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockRes } from "../helpers/mockHttp.js";

vi.mock("@vercel/postgres", () => ({ sql: vi.fn() }));
vi.mock("../../api/_roles.js", () => ({ ensureCommandRolesSchema: vi.fn() }));
vi.mock("../../api/_lib/adminUsers/utils.js", () => ({ authenticateAdmin: vi.fn() }));
vi.mock("../../api/_lib/points.js", () => ({
    buildDownloadUrl: vi.fn((fileName) => `https://points.example/${fileName}`),
    parseStoredBenchFileName: vi.fn((fileName) => ({
        ok: true,
        fileName,
        benchmark: "200",
        delay: 1,
        area: 1,
    })),
}));
vi.mock("../../api/_lib/zip.js", () => ({
    buildZipBuffer: vi.fn(() => Buffer.from("zip")),
}));

import { sql } from "@vercel/postgres";
import { authenticateAdmin } from "../../api/_lib/adminUsers/utils.js";
import handler from "../../api/admin-export-schemes-zip.js";

describe("api/admin-export-schemes-zip handler", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch = vi.fn(async () => ({
            ok: true,
            arrayBuffer: async () => Uint8Array.from([102, 105, 108, 101]).buffer,
        }));
    });

    it("rejects non-GET method", async () => {
        const req = { method: "POST", query: {} };
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(405);
    });

    it("requires auth key", async () => {
        const req = { method: "GET", query: {} };
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(400);
    });

    it("requires admin access", async () => {
        authenticateAdmin.mockResolvedValueOnce(null);
        const req = { method: "GET", query: { authKey: "k" }, headers: { host: "localhost:3000" } };
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(403);
    });

    it("returns schemes archive", async () => {
        authenticateAdmin.mockResolvedValueOnce({ id: 99 });
        sql.mockResolvedValueOnce({ rows: [{ file_name: "bench200_1_1_a_b.bench" }] });

        const req = { method: "GET", query: { authKey: "k" } };
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.headers["Content-Type"]).toBe("application/zip");
        expect(res.headers["Content-Disposition"]).toContain("attachment;");
        expect(res.ended).toBe(true);
    });
});

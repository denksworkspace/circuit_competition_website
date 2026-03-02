// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockRes } from "../helpers/mockHttp.js";

vi.mock("@vercel/postgres", () => ({ sql: vi.fn() }));
vi.mock("../../api/_roles.js", () => ({ ensureCommandRolesSchema: vi.fn() }));
vi.mock("../../api/_lib/commandUploadSettings.js", () => ({ ensureCommandUploadSettingsSchema: vi.fn() }));
vi.mock("../../api/_lib/truthTables.js", () => ({ ensureTruthTablesSchema: vi.fn() }));
vi.mock("../../api/_lib/actionLogs.js", () => ({ ensureActionLogsSchema: vi.fn() }));
vi.mock("../../api/_lib/adminUsers/utils.js", () => ({ authenticateAdmin: vi.fn() }));

import { sql } from "@vercel/postgres";
import { authenticateAdmin } from "../../api/_lib/adminUsers/utils.js";
import handler from "../../api/admin-export-db.js";

describe("api/admin-export-db handler", () => {
    beforeEach(() => {
        vi.clearAllMocks();
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
        const req = { method: "GET", query: { authKey: "k" } };
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(403);
    });

    it("returns database export file", async () => {
        authenticateAdmin.mockResolvedValueOnce({ id: 42 });
        sql
            .mockResolvedValueOnce({ rows: [{ id: 1 }] })
            .mockResolvedValueOnce({ rows: [{ id: 2 }] })
            .mockResolvedValueOnce({ rows: [{ benchmark: "200" }] })
            .mockResolvedValueOnce({ rows: [{ benchmark: "200", file_name: "bench200.truth" }] })
            .mockResolvedValueOnce({ rows: [{ id: 10 }] })
            .mockResolvedValueOnce({ rows: [{ column_name: "id" }] })
            .mockResolvedValueOnce({ rows: [{ column_name: "benchmark" }] })
            .mockResolvedValueOnce({ rows: [{ column_name: "benchmark" }, { column_name: "file_name" }] })
            .mockResolvedValueOnce({ rows: [{ column_name: "id" }] })
            .mockResolvedValueOnce({ rows: [{ column_name: "id" }] });

        const req = { method: "GET", query: { authKey: "k" } };
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.headers["Content-Type"]).toContain("text/sql");
        expect(res.headers["Content-Disposition"]).toContain("attachment;");
        expect(res.ended).toBe(true);
    });
});

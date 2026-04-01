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
vi.mock("../../api/_lib/paretoFilenameSync.js", () => ({
    syncParetoFilenameCsvs: vi.fn(),
}));

import { sql } from "@vercel/postgres";
import { syncParetoFilenameCsvs } from "../../api/_lib/paretoFilenameSync.js";
import handler from "../../api/admin-pareto-filenames-recalculate.js";

describe("api/admin-pareto-filenames-recalculate", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("recalculates both tracked CSV files for admin", async () => {
        sql.mockResolvedValueOnce({ rows: [{ id: 1, role: "admin" }] });

        const req = createMockReq({
            method: "POST",
            body: { authKey: "k" },
        });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(syncParetoFilenameCsvs).toHaveBeenCalledWith({
            statuses: ["verified", "non-verified"],
        });
        expect(res.body.ok).toBe(true);
    });

    it("rejects non-admin", async () => {
        sql.mockResolvedValueOnce({ rows: [{ id: 1, role: "participant" }] });
        const req = createMockReq({
            method: "POST",
            body: { authKey: "k" },
        });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(403);
    });
});


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

import { sql } from "@vercel/postgres";
import handler from "../../api/admin-points-apply.js";

describe("api/admin-points-apply", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("applies statuses", async () => {
        sql.mockResolvedValueOnce({ rows: [{ id: 1, role: "admin" }] });
        sql.mockResolvedValueOnce({ rows: [] });

        const req = createMockReq({
            method: "POST",
            body: {
                authKey: "k",
                checkerVersion: "ABC",
                updates: [{ pointId: "p1", status: "verified" }],
            },
        });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.applied).toBe(1);
    });
});

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
import { ensureCommandRolesSchema } from "../../api/_roles.js";
import handler from "../../api/commands.js";

describe("api/commands handler", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("rejects unsupported method", async () => {
        const req = createMockReq({ method: "POST" });
        const res = createMockRes();

        await handler(req, res);

        expect(res.statusCode).toBe(405);
        expect(res.headers.Allow).toBe("GET");
    });

    it("returns normalized command list", async () => {
        sql.mockResolvedValueOnce({
            rows: [
                { id: "2", name: "alpha", color: "#111", role: "admin" },
                { id: "3", name: "beta", color: "#222", role: "weird" },
            ],
        });

        const req = createMockReq({ method: "GET" });
        const res = createMockRes();

        await handler(req, res);

        expect(ensureCommandRolesSchema).toHaveBeenCalledTimes(1);
        expect(res.statusCode).toBe(200);
        expect(res.body.commands).toEqual([
            { id: 2, name: "alpha", color: "#111", role: "admin" },
            { id: 3, name: "beta", color: "#222", role: "participant" },
        ]);
    });
});

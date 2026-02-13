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
import handler from "../../api/auth.js";

describe("api/auth handler", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("rejects unsupported method", async () => {
        const req = createMockReq({ method: "GET" });
        const res = createMockRes();

        await handler(req, res);

        expect(res.statusCode).toBe(405);
        expect(res.headers.Allow).toBe("POST");
    });

    it("returns 400 for missing auth key", async () => {
        const req = createMockReq({ method: "POST", body: {} });
        const res = createMockRes();

        await handler(req, res);

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toContain("Missing auth key");
    });

    it("returns 401 for invalid key", async () => {
        sql.mockResolvedValueOnce({ rows: [] });
        const req = createMockReq({ method: "POST", body: { authKey: "bad" } });
        const res = createMockRes();

        await handler(req, res);

        expect(ensureCommandRolesSchema).toHaveBeenCalledTimes(1);
        expect(res.statusCode).toBe(401);
    });

    it("returns command for valid key", async () => {
        sql.mockResolvedValueOnce({ rows: [{ id: "1", name: "cmd", color: "#fff", role: "leader" }] });
        const req = createMockReq({ method: "POST", body: { authKey: "good" } });
        const res = createMockRes();

        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.command).toEqual({ id: 1, name: "cmd", color: "#fff", role: "leader" });
    });
});

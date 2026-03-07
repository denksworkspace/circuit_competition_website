// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockReq, createMockRes } from "../helpers/mockHttp.js";

vi.mock("../../api/_lib/adminUsers/utils.js", () => ({
    authenticateAdmin: vi.fn(),
}));
vi.mock("../../api/_lib/maintenanceMode.js", () => ({
    getMaintenanceState: vi.fn(),
    parseWhitelistAdminIds: vi.fn((value) => value),
    setMaintenanceState: vi.fn(),
}));

import { authenticateAdmin } from "../../api/_lib/adminUsers/utils.js";
import { getMaintenanceState, parseWhitelistAdminIds, setMaintenanceState } from "../../api/_lib/maintenanceMode.js";
import handler from "../../api/admin-maintenance.js";

describe("api/admin-maintenance handler", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("rejects non GET/PATCH", async () => {
        const req = createMockReq({ method: "POST" });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(405);
    });

    it("requires admin auth", async () => {
        authenticateAdmin.mockResolvedValueOnce(null);
        const req = createMockReq({ method: "GET", body: {} });
        req.query = { authKey: "k" };
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(403);
    });

    it("returns current maintenance state", async () => {
        authenticateAdmin.mockResolvedValueOnce({ id: 1 });
        getMaintenanceState.mockResolvedValueOnce({ enabled: true, message: "m", whitelistAdminIds: [1] });
        const req = createMockReq({ method: "GET" });
        req.query = { authKey: "k" };
        const res = createMockRes();

        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.maintenance).toMatchObject({ enabled: true, message: "m", whitelistAdminIds: [1] });
    });

    it("updates maintenance state", async () => {
        authenticateAdmin.mockResolvedValueOnce({ id: 1 });
        parseWhitelistAdminIds.mockReturnValueOnce([1, 2]);
        setMaintenanceState.mockResolvedValueOnce({ enabled: true, message: "hello", whitelistAdminIds: [1, 2] });
        const req = createMockReq({
            method: "PATCH",
            body: {
                authKey: "k",
                enabled: true,
                message: "hello",
                whitelistAdminIds: "1,2",
            },
        });
        req.query = {};
        const res = createMockRes();

        await handler(req, res);

        expect(parseWhitelistAdminIds).toHaveBeenCalledWith("1,2");
        expect(setMaintenanceState).toHaveBeenCalledWith({
            enabled: true,
            message: "hello",
            whitelistAdminIds: [1, 2],
        });
        expect(res.statusCode).toBe(200);
        expect(res.body.maintenance).toMatchObject({ enabled: true, whitelistAdminIds: [1, 2] });
    });
});

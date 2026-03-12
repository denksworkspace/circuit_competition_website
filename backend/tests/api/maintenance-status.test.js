// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockReq, createMockRes } from "../helpers/mockHttp.js";

vi.mock("../../api/_lib/maintenanceMode.js", () => ({
    getMaintenanceState: vi.fn(),
    canBypassMaintenance: vi.fn(),
}));

import { canBypassMaintenance, getMaintenanceState } from "../../api/_lib/maintenanceMode.js";
import handler from "../../api/maintenance-status.js";

describe("api/maintenance-status handler", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("rejects non-GET method", async () => {
        const req = createMockReq({ method: "POST" });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(405);
    });

    it("returns maintenance disabled when flag is off", async () => {
        getMaintenanceState.mockResolvedValueOnce({
            enabled: false,
            message: "x",
            whitelistAdminIds: [1],
        });
        const req = createMockReq({ method: "GET" });
        req.query = { authKey: "admin-key" };
        const res = createMockRes();

        await handler(req, res);

        expect(canBypassMaintenance).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(200);
        expect(res.body.maintenance).toMatchObject({
            enabled: false,
            activeForUser: false,
            bypass: false,
        });
    });

    it("returns activeForUser=false for whitelisted admin", async () => {
        getMaintenanceState.mockResolvedValueOnce({
            enabled: true,
            message: "maintenance",
            whitelistAdminIds: [1],
        });
        canBypassMaintenance.mockResolvedValueOnce(true);
        const req = createMockReq({ method: "GET" });
        req.query = { authKey: "admin-key" };
        const res = createMockRes();

        await handler(req, res);

        expect(canBypassMaintenance).toHaveBeenCalledTimes(1);
        expect(res.statusCode).toBe(200);
        expect(res.body.maintenance).toMatchObject({
            enabled: true,
            bypass: true,
            activeForUser: false,
            message: "maintenance",
        });
    });
});

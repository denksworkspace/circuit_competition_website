// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockReq, createMockRes } from "../helpers/mockHttp.js";

vi.mock("../../api/_lib/maintenanceMode.js", () => ({
    resolveMaintenanceStatus: vi.fn(),
}));

import { resolveMaintenanceStatus } from "../../api/_lib/maintenanceMode.js";
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
        resolveMaintenanceStatus.mockResolvedValueOnce({
            enabled: false,
            message: "x",
            bypass: false,
            activeForUser: false,
            reason: "none",
            compatibility: null,
        });
        const req = createMockReq({ method: "GET" });
        req.query = {};
        const res = createMockRes();

        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.maintenance).toMatchObject({
            enabled: false,
            activeForUser: false,
            bypass: false,
        });
    });

    it("returns activeForUser=false for whitelisted admin", async () => {
        resolveMaintenanceStatus.mockResolvedValueOnce({
            enabled: true,
            message: "maintenance",
            bypass: true,
            activeForUser: false,
            reason: "manual",
            compatibility: null,
        });
        const req = createMockReq({ method: "GET" });
        req.query = { authKey: "admin-key" };
        const res = createMockRes();

        await handler(req, res);

        expect(resolveMaintenanceStatus).toHaveBeenCalledTimes(1);
        expect(res.statusCode).toBe(200);
        expect(res.body.maintenance).toMatchObject({
            enabled: true,
            bypass: true,
            activeForUser: false,
            message: "maintenance",
        });
    });

    it("returns deploy mismatch state when compatibility guard is active", async () => {
        resolveMaintenanceStatus.mockResolvedValueOnce({
            enabled: true,
            bypass: false,
            activeForUser: true,
            message: "Deployment mismatch detected.",
            reason: "deploy_mismatch",
            compatibility: {
                mismatch: true,
                reason: "deploy-drift",
                frontendBuildTs: 100,
                backendBuildTs: 200,
                driftSeconds: 0.1,
                maxDriftSeconds: 0,
            },
        });
        const req = createMockReq({ method: "GET" });
        req.query = {};
        const res = createMockRes();

        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.maintenance).toMatchObject({
            enabled: true,
            activeForUser: true,
            bypass: false,
            reason: "deploy_mismatch",
        });
        expect(res.body.maintenance.compatibility).toMatchObject({
            mismatch: true,
        });
    });
});

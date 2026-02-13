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
    normalizeCommandUploadSettings: vi.fn((row) => ({
        maxSingleUploadBytes: Number(row?.max_single_upload_bytes || 1),
        totalUploadQuotaBytes: Number(row?.total_upload_quota_bytes || 1),
        uploadedBytesTotal: Number(row?.uploaded_bytes_total || 0),
        remainingUploadBytes:
            Number(row?.total_upload_quota_bytes || 1) - Number(row?.uploaded_bytes_total || 0),
    })),
}));
vi.mock("../../api/_lib/actionLogs.js", () => ({
    addActionLog: vi.fn(),
    getActionLogsForCommand: vi.fn(async () => [{ id: 1, action: "x" }]),
}));

import { sql } from "@vercel/postgres";
import handler from "../../api/admin-users.js";

describe("api/admin-users handler", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("rejects method", async () => {
        const req = createMockReq({ method: "POST" });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(405);
    });

    it("GET requires admin", async () => {
        sql.mockResolvedValueOnce({ rows: [] });
        const req = { method: "GET", query: { authKey: "k", userId: "1" } };
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(403);
    });

    it("GET returns user and logs", async () => {
        sql.mockResolvedValueOnce({ rows: [{ id: 99, role: "admin" }] });
        sql.mockResolvedValueOnce({
            rows: [{ id: 1, name: "u", color: "#111", role: "leader", max_single_upload_bytes: 100, total_upload_quota_bytes: 200, uploaded_bytes_total: 50 }],
        });

        const req = { method: "GET", query: { authKey: "k", userId: "1" } };
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.user.id).toBe(1);
        expect(Array.isArray(res.body.actionLogs)).toBe(true);
    });

    it("PATCH updates settings", async () => {
        sql.mockResolvedValueOnce({ rows: [{ id: 99, role: "admin" }] });
        sql.mockResolvedValueOnce({
            rows: [{ id: 1, name: "u", color: "#111", role: "leader", max_single_upload_bytes: 100, total_upload_quota_bytes: 200, uploaded_bytes_total: 50 }],
        });

        const req = createMockReq({
            method: "PATCH",
            body: {
                authKey: "k",
                userId: 1,
                maxSingleUploadGb: 1,
                totalUploadQuotaGb: 2,
            },
        });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.user.id).toBe(1);
    });
});

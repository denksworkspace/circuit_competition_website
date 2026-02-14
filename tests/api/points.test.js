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
vi.mock("../../api/_lib/commandUploadSettings.js", () => ({
    ensureCommandUploadSettingsSchema: vi.fn(),
    normalizeCommandUploadSettings: vi.fn((row) => ({
        maxSingleUploadBytes: Number(row?.max_single_upload_bytes || 500 * 1024 * 1024),
        totalUploadQuotaBytes: Number(row?.total_upload_quota_bytes || 50 * 1024 * 1024 * 1024),
        maxMultiFileBatchCount: Number(row?.max_multi_file_batch_count || 100),
        uploadedBytesTotal: Number(row?.uploaded_bytes_total || 0),
        remainingUploadBytes:
            Number(row?.total_upload_quota_bytes || 50 * 1024 * 1024 * 1024) - Number(row?.uploaded_bytes_total || 0),
    })),
}));
vi.mock("../../api/_lib/actionLogs.js", () => ({
    addActionLog: vi.fn(),
}));

import { sql } from "@vercel/postgres";
import { ensureCommandRolesSchema } from "../../api/_roles.js";
import handler from "../../api/points.js";

describe("api/points handler", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("GET returns normalized points", async () => {
        sql.mockResolvedValueOnce({
            rows: [
                {
                    id: "id1",
                    benchmark: "254",
                    delay: "10",
                    area: "20",
                    description: "schema",
                    sender: "team",
                    file_name: "f.bench",
                    status: "verified",
                    checker_version: null,
                },
            ],
        });

        const req = createMockReq({ method: "GET" });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.points[0].delay).toBe(10);
        expect(res.body.points[0].area).toBe(20);
    });

    it("POST rejects missing auth key", async () => {
        const req = createMockReq({ method: "POST", body: {} });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(401);
    });

    it("POST rejects invalid auth key", async () => {
        sql.mockResolvedValueOnce({ rows: [] });
        const req = createMockReq({ method: "POST", body: { authKey: "bad" } });
        const res = createMockRes();
        await handler(req, res);

        expect(ensureCommandRolesSchema).toHaveBeenCalledTimes(1);
        expect(res.statusCode).toBe(401);
    });

    it("POST validates payload and status", async () => {
        sql.mockResolvedValueOnce({
            rows: [{ id: 1, name: "team", role: "participant", max_single_upload_bytes: 500 * 1024 * 1024, total_upload_quota_bytes: 50 * 1024 * 1024 * 1024, uploaded_bytes_total: 0 }],
        });
        let req = createMockReq({ method: "POST", body: { authKey: "k" } });
        let res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(400);

        sql.mockResolvedValueOnce({
            rows: [{ id: 1, name: "team", role: "participant", max_single_upload_bytes: 500 * 1024 * 1024, total_upload_quota_bytes: 50 * 1024 * 1024 * 1024, uploaded_bytes_total: 0 }],
        });
        req = createMockReq({
            method: "POST",
            body: {
                authKey: "k",
                id: "p1",
                benchmark: "254",
                delay: 1,
                area: 2,
                fileName: "file.bench",
                fileSize: 1,
                batchSize: 1,
                status: "wrong",
            },
        });
        res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(400);
    });

    it("POST rejects batch size over user limit", async () => {
        sql.mockResolvedValueOnce({
            rows: [{ id: 1, name: "team", role: "participant", max_single_upload_bytes: 500 * 1024 * 1024, total_upload_quota_bytes: 50 * 1024 * 1024 * 1024, max_multi_file_batch_count: 20, uploaded_bytes_total: 0 }],
        });
        const req = createMockReq({
            method: "POST",
            body: {
                authKey: "k",
                id: "p1",
                benchmark: "254",
                delay: 1,
                area: 2,
                fileName: "file.bench",
                fileSize: 1,
                batchSize: 21,
            },
        });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toContain("Maximum is 20");
    });

    it("POST rejects too long description and bad fileSize", async () => {
        sql.mockResolvedValue({
            rows: [{ id: 1, name: "team", role: "participant", max_single_upload_bytes: 500 * 1024 * 1024, total_upload_quota_bytes: 50 * 1024 * 1024 * 1024, uploaded_bytes_total: 0 }],
        });

        let req = createMockReq({
            method: "POST",
            body: {
                authKey: "k",
                id: "p1",
                benchmark: "254",
                delay: 1,
                area: 2,
                fileName: "file.bench",
                description: "x".repeat(201),
                fileSize: 1,
                batchSize: 1,
            },
        });
        let res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(400);

        req = createMockReq({
            method: "POST",
            body: {
                authKey: "k",
                id: "p1",
                benchmark: "254",
                delay: 1,
                area: 2,
                fileName: "file.bench",
                fileSize: -1,
                batchSize: 1,
            },
        });
        res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(400);
    });

    it("POST rejects file too large", async () => {
        sql.mockResolvedValueOnce({
            rows: [{ id: 1, name: "team", role: "participant", max_single_upload_bytes: 500 * 1024 * 1024, total_upload_quota_bytes: 50 * 1024 * 1024 * 1024, uploaded_bytes_total: 0 }],
        });

        const req = createMockReq({
            method: "POST",
            body: {
                authKey: "k",
                id: "p1",
                benchmark: "254",
                delay: 1,
                area: 2,
                fileName: "file.bench",
                fileSize: 500 * 1024 * 1024 + 1,
                batchSize: 1,
            },
        });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(413);
    });

    it("POST returns 409 for duplicate benchmark/delay/area", async () => {
        sql.mockResolvedValueOnce({
            rows: [{ id: 1, name: "team", role: "leader", max_single_upload_bytes: 500 * 1024 * 1024, total_upload_quota_bytes: 50 * 1024 * 1024 * 1024, uploaded_bytes_total: 0 }],
        });
        sql.mockResolvedValueOnce({ rows: [{ id: "exists" }] });

        const req = createMockReq({
            method: "POST",
            body: {
                authKey: "k",
                id: "p1",
                benchmark: "254",
                delay: 1,
                area: 2,
                fileName: "file.bench",
                fileSize: 10,
                batchSize: 1,
            },
        });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(409);
    });

    it("POST handles duplicate insert errors", async () => {
        sql.mockResolvedValueOnce({
            rows: [{ id: 1, name: "team", role: "leader", max_single_upload_bytes: 500 * 1024 * 1024, total_upload_quota_bytes: 50 * 1024 * 1024 * 1024, uploaded_bytes_total: 0 }],
        });
        sql.mockResolvedValueOnce({ rows: [] });
        sql.mockRejectedValueOnce(new Error("duplicate key value violates unique constraint"));

        const req = createMockReq({
            method: "POST",
            body: {
                authKey: "k",
                id: "p1",
                benchmark: "254",
                delay: 1,
                area: 2,
                fileName: "file.bench",
                fileSize: 10,
                batchSize: 1,
            },
        });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(409);
    });

    it("POST creates point for valid payload", async () => {
        sql.mockResolvedValueOnce({
            rows: [{ id: 1, name: "team", role: "leader", max_single_upload_bytes: 500 * 1024 * 1024, total_upload_quota_bytes: 50 * 1024 * 1024 * 1024, uploaded_bytes_total: 0 }],
        });
        sql.mockResolvedValueOnce({ rows: [] });
        sql.mockResolvedValueOnce({ rows: [{ uploaded_bytes_total: 0, total_upload_quota_bytes: 50 * 1024 * 1024 * 1024, max_single_upload_bytes: 500 * 1024 * 1024, role: "leader" }] });
        sql.mockResolvedValueOnce({
            rows: [
                {
                    id: "p1",
                    benchmark: "254",
                    delay: "1",
                    area: "2",
                    description: "schema",
                    sender: "team",
                    file_name: "file.bench",
                    status: "non-verified",
                    checker_version: null,
                },
            ],
        });

        const req = createMockReq({
            method: "POST",
            body: {
                authKey: "k",
                id: "p1",
                benchmark: "254",
                delay: 1,
                area: 2,
                fileName: "file.bench",
                fileSize: 10,
                batchSize: 2,
            },
        });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(201);
        expect(res.body.point.id).toBe("p1");
    });

    it("POST defaults missing batchSize to single-file mode", async () => {
        sql.mockResolvedValueOnce({
            rows: [{ id: 1, name: "team", role: "leader", max_single_upload_bytes: 500 * 1024 * 1024, total_upload_quota_bytes: 50 * 1024 * 1024 * 1024, uploaded_bytes_total: 0 }],
        });
        sql.mockResolvedValueOnce({ rows: [] });
        sql.mockResolvedValueOnce({
            rows: [
                {
                    id: "p1",
                    benchmark: "254",
                    delay: "1",
                    area: "2",
                    description: "schema",
                    sender: "team",
                    file_name: "file.bench",
                    status: "non-verified",
                    checker_version: null,
                },
            ],
        });

        const req = createMockReq({
            method: "POST",
            body: {
                authKey: "k",
                id: "p1",
                benchmark: "254",
                delay: 1,
                area: 2,
                fileName: "file.bench",
                fileSize: 10,
            },
        });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(201);
        expect(res.body.point.id).toBe("p1");
    });

    it("DELETE validates auth and ownership", async () => {
        let req = createMockReq({ method: "DELETE", body: { id: "p", authKey: "" } });
        let res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(401);

        sql.mockResolvedValueOnce({ rows: [] });
        req = createMockReq({ method: "DELETE", body: { id: "p", authKey: "k" } });
        res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(401);

        sql.mockResolvedValueOnce({ rows: [{ id: 10 }] });
        sql.mockResolvedValueOnce({ rows: [] });
        req = createMockReq({ method: "DELETE", body: { id: "p", authKey: "k" } });
        res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(404);

        sql.mockResolvedValueOnce({ rows: [{ id: 10 }] });
        sql.mockResolvedValueOnce({ rows: [{ id: "p", command_id: 11 }] });
        req = createMockReq({ method: "DELETE", body: { id: "p", authKey: "k" } });
        res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(403);
    });

    it("DELETE removes owned point", async () => {
        sql.mockResolvedValueOnce({ rows: [{ id: 10 }] });
        sql.mockResolvedValueOnce({ rows: [{ id: "p", command_id: 10 }] });
        sql.mockResolvedValueOnce({ rows: [] });

        const req = createMockReq({ method: "DELETE", body: { id: "p", authKey: "k" } });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.ok).toBe(true);
    });

    it("rejects unsupported methods", async () => {
        const req = createMockReq({ method: "PUT" });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(405);
        expect(res.headers.Allow).toBe("GET, POST, DELETE");
    });
});

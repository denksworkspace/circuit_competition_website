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
vi.mock("../../api/_lib/s3Presign.js", () => ({
    buildPresignedPutUrl: vi.fn(() => "https://signed.example/upload"),
}));

import { sql } from "@vercel/postgres";
import { ensureCommandRolesSchema } from "../../api/_roles.js";
import { buildPresignedPutUrl } from "../../api/_lib/s3Presign.js";
import handler from "../../api/points-upload-url.js";

describe("api/points-upload-url handler", () => {
    const benchName = "bench254_10_20_sender_pid.bench";

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.AWS_ACCESS_KEY_ID = "AKIA";
        process.env.AWS_SECRET_ACCESS_KEY = "SECRET";
        process.env.AWS_REGION = "us-east-1";
        process.env.S3_BUCKET = "my-bucket";
        delete process.env.AWS_SESSION_TOKEN;
    });

    it("rejects unsupported method", async () => {
        const req = createMockReq({ method: "GET" });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(405);
    });

    it("returns 401 when auth key missing", async () => {
        const req = createMockReq({ method: "POST", body: { fileName: benchName, fileSize: 10, batchSize: 1 } });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(401);
    });

    it("returns 400 for invalid file name", async () => {
        const req = createMockReq({ method: "POST", body: { authKey: "k", fileName: "bad", fileSize: 10, batchSize: 1 } });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(400);
    });

    it("returns 400 for invalid file size", async () => {
        const req = createMockReq({ method: "POST", body: { authKey: "k", fileName: benchName, fileSize: -1, batchSize: 1 } });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(400);
    });

    it("returns 400 when batch size exceeds user limit", async () => {
        sql.mockResolvedValueOnce({
            rows: [{ id: 1, role: "leader", max_single_upload_bytes: 500 * 1024 * 1024, total_upload_quota_bytes: 50 * 1024 * 1024 * 1024, max_multi_file_batch_count: 20, uploaded_bytes_total: 0 }],
        });
        const req = createMockReq({ method: "POST", body: { authKey: "k", fileName: benchName, fileSize: 10, batchSize: 21 } });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toContain("Maximum is 20");
    });

    it("defaults missing batchSize to single-file upload", async () => {
        sql.mockResolvedValueOnce({
            rows: [{ id: 1, role: "leader", max_single_upload_bytes: 500 * 1024 * 1024, total_upload_quota_bytes: 50 * 1024 * 1024 * 1024, uploaded_bytes_total: 0 }],
        });
        sql.mockResolvedValueOnce({ rows: [] });

        const req = createMockReq({ method: "POST", body: { authKey: "k", fileName: benchName, fileSize: 10 } });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.body.quota.isMultiFileBatch).toBe(false);
        expect(res.body.quota.chargedBytes).toBe(0);
    });

    it("returns 401 when command not found", async () => {
        sql.mockResolvedValueOnce({ rows: [] });
        const req = createMockReq({ method: "POST", body: { authKey: "k", fileName: benchName, fileSize: 10, batchSize: 1 } });
        const res = createMockRes();
        await handler(req, res);
        expect(ensureCommandRolesSchema).toHaveBeenCalledTimes(1);
        expect(res.statusCode).toBe(401);
    });

    it("returns 413 when size exceeds role limit", async () => {
        sql.mockResolvedValueOnce({
            rows: [{ id: 1, role: "participant", max_single_upload_bytes: 500 * 1024 * 1024, total_upload_quota_bytes: 1_000, uploaded_bytes_total: 0 }],
        });
        const req = createMockReq({
            method: "POST",
            body: { authKey: "k", fileName: benchName, fileSize: 500 * 1024 * 1024 + 1, batchSize: 1 },
        });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(413);
    });

    it("returns 409 on duplicate point", async () => {
        sql.mockResolvedValueOnce({
            rows: [{ id: 1, role: "leader", max_single_upload_bytes: 500 * 1024 * 1024, total_upload_quota_bytes: 50 * 1024 * 1024 * 1024, uploaded_bytes_total: 0 }],
        });
        sql.mockResolvedValueOnce({ rows: [{ id: "dup" }] });

        const req = createMockReq({ method: "POST", body: { authKey: "k", fileName: benchName, fileSize: 10, batchSize: 1 } });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(409);
    });

    it("returns 500 when s3 env incomplete", async () => {
        process.env.S3_BUCKET = "";
        sql.mockResolvedValueOnce({
            rows: [{ id: 1, role: "leader", max_single_upload_bytes: 500 * 1024 * 1024, total_upload_quota_bytes: 50 * 1024 * 1024 * 1024, uploaded_bytes_total: 0 }],
        });
        sql.mockResolvedValueOnce({ rows: [] });

        const req = createMockReq({ method: "POST", body: { authKey: "k", fileName: benchName, fileSize: 10, batchSize: 1 } });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(500);
    });

    it("returns signed upload url for valid payload", async () => {
        sql.mockResolvedValueOnce({
            rows: [{ id: 1, role: "admin", max_single_upload_bytes: 50 * 1024 * 1024 * 1024, total_upload_quota_bytes: 50 * 1024 * 1024 * 1024, uploaded_bytes_total: 0 }],
        });
        sql.mockResolvedValueOnce({ rows: [] });

        const req = createMockReq({ method: "POST", body: { authKey: "k", fileName: benchName, fileSize: 10, batchSize: 1 } });
        const res = createMockRes();
        await handler(req, res);

        expect(buildPresignedPutUrl).toHaveBeenCalledTimes(1);
        expect(res.statusCode).toBe(200);
        expect(res.body.uploadUrl).toBe("https://signed.example/upload");
        expect(res.body.fileKey).toBe(`points/${benchName}`);
    });
});

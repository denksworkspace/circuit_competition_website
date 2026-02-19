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
    DEFAULT_MAX_MULTI_FILE_BATCH_COUNT: 100,
    ensureCommandUploadSettingsSchema: vi.fn(),
    normalizeCommandUploadSettings: vi.fn((row) => ({
        maxSingleUploadBytes: Number(row?.max_single_upload_bytes || 1024),
        totalUploadQuotaBytes: Number(row?.total_upload_quota_bytes || 10_000),
        maxMultiFileBatchCount: Number(row?.max_multi_file_batch_count || 100),
        uploadedBytesTotal: Number(row?.uploaded_bytes_total || 0),
        remainingUploadBytes:
            Number(row?.total_upload_quota_bytes || 10_000) - Number(row?.uploaded_bytes_total || 0),
    })),
}));
vi.mock("../../api/_lib/s3Presign.js", () => ({
    buildPresignedPutUrl: vi.fn(() => "https://signed.example/truth"),
}));

import { sql } from "@vercel/postgres";
import { buildPresignedPutUrl } from "../../api/_lib/s3Presign.js";
import handler from "../../api/truth-upload-url.js";

describe("api/truth-upload-url", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.AWS_ACCESS_KEY_ID = "AKIA";
        process.env.AWS_SECRET_ACCESS_KEY = "SECRET";
        process.env.AWS_REGION = "us-east-1";
        process.env.S3_BUCKET = "bucket";
    });

    it("rejects non-admin", async () => {
        sql.mockResolvedValueOnce({
            rows: [{ id: 1, role: "participant", max_single_upload_bytes: 1024, total_upload_quota_bytes: 10_000, uploaded_bytes_total: 0, max_multi_file_batch_count: 100 }],
        });
        const req = createMockReq({
            method: "POST",
            body: { authKey: "k", fileName: "bench200.truth", fileSize: 10 },
        });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(403);
    });

    it("returns signed url for admin", async () => {
        sql.mockResolvedValueOnce({
            rows: [{ id: 1, role: "admin", max_single_upload_bytes: 1024, total_upload_quota_bytes: 10_000, uploaded_bytes_total: 0, max_multi_file_batch_count: 100 }],
        });
        const req = createMockReq({
            method: "POST",
            body: { authKey: "k", fileName: "bench200.truth", fileSize: 10 },
        });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(buildPresignedPutUrl).toHaveBeenCalledTimes(1);
        expect(res.body.fileKey).toBe("truth_tables/bench200.truth");
    });
});

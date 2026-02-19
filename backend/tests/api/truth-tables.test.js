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
vi.mock("../../api/_lib/truthTables.js", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        ensureTruthTablesSchema: vi.fn(),
        benchmarkExists: vi.fn(),
        ensureBenchmarkExists: vi.fn(),
        getTruthTableByBenchmark: vi.fn(),
    };
});
vi.mock("../../api/_lib/actionLogs.js", () => ({
    addActionLog: vi.fn(),
}));
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

import { sql } from "@vercel/postgres";
import {
    benchmarkExists,
    ensureBenchmarkExists,
    getTruthTableByBenchmark,
} from "../../api/_lib/truthTables.js";
import { addActionLog } from "../../api/_lib/actionLogs.js";
import handler from "../../api/truth-tables.js";

describe("api/truth-tables", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("requires create flag for missing benchmark", async () => {
        sql.mockResolvedValueOnce({
            rows: [{ id: 1, role: "admin", max_single_upload_bytes: 1024, total_upload_quota_bytes: 10_000, uploaded_bytes_total: 0, max_multi_file_batch_count: 100 }],
        });
        benchmarkExists.mockResolvedValueOnce(false);

        const req = createMockReq({
            method: "POST",
            body: { authKey: "k", fileName: "bench200.truth", fileSize: 10, batchSize: 2 },
        });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(409);
        expect(res.body.code).toBe("BENCHMARK_MISSING");
    });

    it("requires replace flag when truth exists", async () => {
        sql.mockResolvedValueOnce({
            rows: [{ id: 1, role: "admin", max_single_upload_bytes: 1024, total_upload_quota_bytes: 10_000, uploaded_bytes_total: 0, max_multi_file_batch_count: 100 }],
        });
        benchmarkExists.mockResolvedValueOnce(true);
        getTruthTableByBenchmark.mockResolvedValueOnce({ benchmark: "200", fileName: "bench200.truth" });

        const req = createMockReq({
            method: "POST",
            body: { authKey: "k", fileName: "bench200.truth", fileSize: 10, batchSize: 2 },
        });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(409);
        expect(res.body.code).toBe("TRUTH_EXISTS");
    });

    it("creates benchmark and saves truth", async () => {
        sql.mockResolvedValueOnce({
            rows: [{ id: 1, role: "admin", max_single_upload_bytes: 1024, total_upload_quota_bytes: 10_000, uploaded_bytes_total: 0, max_multi_file_batch_count: 100 }],
        });
        benchmarkExists.mockResolvedValueOnce(false);
        getTruthTableByBenchmark.mockResolvedValueOnce(null);
        sql.mockResolvedValueOnce({ rows: [{ id: 1 }] });
        sql.mockResolvedValueOnce({ rows: [] });

        const req = createMockReq({
            method: "POST",
            body: {
                authKey: "k",
                fileName: "bench200.truth",
                fileSize: 10,
                batchSize: 2,
                allowCreateBenchmark: true,
            },
        });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(ensureBenchmarkExists).toHaveBeenCalledTimes(1);
        expect(addActionLog).toHaveBeenCalledTimes(1);
    });
});

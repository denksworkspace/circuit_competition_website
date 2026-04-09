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
    normalizeCommandUploadSettings: vi.fn(() => ({
        maxSingleUploadBytes: 500 * 1024 * 1024,
        totalUploadQuotaBytes: 50 * 1024 * 1024 * 1024,
        uploadedBytesTotal: 0,
        remainingUploadBytes: 50 * 1024 * 1024 * 1024,
        maxMultiFileBatchCount: 100,
    })),
}));
vi.mock("../../api/_lib/uploadQueue.js", () => ({
    REQUEST_STATUS_QUEUED: "queued",
    ensureUploadQueueSchema: vi.fn(),
    isActiveRequestStatus: vi.fn((status) => String(status || "").toLowerCase() === "queued"),
    normalizeUploadRequestRow: vi.fn((row) => ({
        id: String(row?.id || ""),
        status: String(row?.status || "queued"),
        totalCount: Number(row?.total_count || 0),
        doneCount: Number(row?.done_count || 0),
        verifiedCount: Number(row?.verified_count || 0),
    })),
}));
vi.mock("../../api/_lib/uploadQueueOps.js", () => ({
    finalizeUploadRequestPareto: vi.fn(),
    findLatestBlockingUploadRequest: vi.fn(),
    findLatestVisibleUploadRequest: vi.fn(),
    getCommandByAuthKey: vi.fn(),
    loadUploadRequestSnapshot: vi.fn(),
}));
vi.mock("../../api/_lib/queueS3.js", () => ({
    buildQueueObjectKey: vi.fn(({ requestId, fileId, originalFileName }) => `queue/${requestId}/${fileId}-${originalFileName}`),
    buildQueueUploadUrl: vi.fn((key) => `https://signed.example/${encodeURIComponent(key)}`),
    getQueueBucketName: vi.fn(() => "queue-bucket"),
}));
vi.mock("../../api/_lib/uploadQueueToken.js", () => ({
    uid: vi.fn(),
}));
vi.mock("../../api/_lib/pointVerification.js", () => ({
    normalizeCheckerVersion: vi.fn((raw) => String(raw || "none")),
}));
vi.mock("../../api/_lib/maintenanceMode.js", () => ({
    checkMaintenanceBlock: vi.fn(async () => ({ blocked: false, state: null })),
}));

import { sql } from "@vercel/postgres";
import {
    findLatestBlockingUploadRequest,
    findLatestVisibleUploadRequest,
    getCommandByAuthKey,
    loadUploadRequestSnapshot,
} from "../../api/_lib/uploadQueueOps.js";
import { uid } from "../../api/_lib/uploadQueueToken.js";
import createHandler from "../../api/points-upload-request-create.js";
import activeHandler from "../../api/points-upload-request-active.js";
import statusHandler from "../../api/points-upload-request-status.js";
import { checkMaintenanceBlock } from "../../api/_lib/maintenanceMode.js";

describe("upload request core handlers", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        checkMaintenanceBlock.mockResolvedValue({ blocked: false, state: null });
    });

    it("creates upload request and returns signed queue upload urls", async () => {
        uid
            .mockReturnValueOnce("req_1")
            .mockReturnValueOnce("file_1");
        getCommandByAuthKey.mockResolvedValueOnce({
            id: 10,
            name: "team1",
            abc_metrics_timeout_seconds: 60,
            abc_verify_timeout_seconds: 60,
        });
        findLatestBlockingUploadRequest.mockResolvedValueOnce(null);
        sql
            .mockResolvedValueOnce({ rows: [] }) // begin
            .mockResolvedValueOnce({ rows: [] }) // insert request
            .mockResolvedValueOnce({ rows: [] }) // insert file
            .mockResolvedValueOnce({ rows: [] }) // commit
            .mockResolvedValueOnce({ rows: [{ id: "req_1", status: "queued", total_count: 1, done_count: 0, verified_count: 0 }] }); // select created

        const req = createMockReq({
            method: "POST",
            body: {
                authKey: "k",
                files: [{ originalFileName: "bench254_10_20.bench", fileSize: 1024 }],
                description: "schema",
                selectedParser: "ABC",
                selectedChecker: "none",
            },
        });
        const res = createMockRes();
        await createHandler(req, res);

        expect(res.statusCode).toBe(201);
        expect(res.body.request.id).toBe("req_1");
        expect(res.body.files).toHaveLength(1);
        expect(res.body.files[0].uploadUrl).toContain("https://signed.example/");
    });

    it("returns conflict when there is active request", async () => {
        getCommandByAuthKey.mockResolvedValueOnce({ id: 10 });
        findLatestBlockingUploadRequest.mockResolvedValueOnce({ id: "req_1", status: "queued", has_pending_manual_verdict: false });

        const req = createMockReq({
            method: "POST",
            body: {
                authKey: "k",
                files: [{ originalFileName: "bench254_10_20.bench", fileSize: 1 }],
                selectedParser: "ABC",
            },
        });
        const res = createMockRes();
        await createHandler(req, res);

        expect(res.statusCode).toBe(409);
        expect(String(res.body?.error || "")).toContain("active upload request");
    });

    it("rejects create request during maintenance", async () => {
        getCommandByAuthKey.mockResolvedValueOnce({ id: 10 });
        checkMaintenanceBlock.mockResolvedValueOnce({
            blocked: true,
            state: { message: "Maintenance." },
        });

        const req = createMockReq({
            method: "POST",
            body: {
                authKey: "k",
                files: [{ originalFileName: "bench254_10_20.bench", fileSize: 1 }],
                selectedParser: "ABC",
            },
        });
        const res = createMockRes();
        await createHandler(req, res);

        expect(res.statusCode).toBe(503);
        expect(res.body.error).toBe("Maintenance.");
    });

    it("returns active request snapshot", async () => {
        getCommandByAuthKey.mockResolvedValueOnce({ id: 10 });
        findLatestVisibleUploadRequest.mockResolvedValueOnce({ id: "req_1", status: "queued" });
        loadUploadRequestSnapshot.mockResolvedValueOnce({
            request: { id: "req_1", status: "queued" },
            files: [{ id: "file_1" }],
        });

        const req = createMockReq({ method: "GET" });
        req.query = { authKey: "k" };
        const res = createMockRes();
        await activeHandler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.request.id).toBe("req_1");
        expect(res.body.files).toHaveLength(1);
    });

    it("returns latest terminal request snapshot when no blocking request exists", async () => {
        getCommandByAuthKey.mockResolvedValueOnce({ id: 10 });
        findLatestVisibleUploadRequest.mockResolvedValueOnce({ id: "req_finished", status: "completed" });
        loadUploadRequestSnapshot.mockResolvedValueOnce({
            request: { id: "req_finished", status: "completed" },
            files: [{ id: "file_finished" }],
        });

        const req = createMockReq({ method: "GET" });
        req.query = { authKey: "k" };
        const res = createMockRes();
        await activeHandler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.request.id).toBe("req_finished");
        expect(res.body.request.status).toBe("completed");
        expect(res.body.files).toHaveLength(1);
    });

    it("returns upload request status snapshot by request id", async () => {
        getCommandByAuthKey.mockResolvedValueOnce({ id: 10 });
        loadUploadRequestSnapshot.mockResolvedValueOnce({
            request: { id: "req_2", status: "processing" },
            files: [{ id: "file_2" }],
        });

        const req = createMockReq({ method: "GET" });
        req.query = { authKey: "k", requestId: "req_2" };
        const res = createMockRes();
        await statusHandler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.request.id).toBe("req_2");
        expect(res.body.files[0].id).toBe("file_2");
    });
});

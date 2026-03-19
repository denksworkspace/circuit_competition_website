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
}));
vi.mock("../../api/_lib/pointsStatus.js", () => ({
    ensurePointsStatusConstraint: vi.fn(),
}));
vi.mock("../../api/_lib/uploadQueue.js", () => ({
    FILE_PROCESS_STATE_PROCESSING: "processing",
    FILE_VERDICT_FAILED: "failed",
    REQUEST_STATUS_COMPLETED: "completed",
    REQUEST_STATUS_FAILED: "failed",
    REQUEST_STATUS_FREEZED: "freezed",
    REQUEST_STATUS_INTERRUPTED: "interrupted",
    REQUEST_STATUS_PROCESSING: "processing",
    REQUEST_STATUS_WAITING_MANUAL_VERDICT: "waiting_manual_verdict",
    REQUEST_STATUS_CLOSED: "closed",
    ensureUploadQueueSchema: vi.fn(),
    normalizeUploadRequestRow: vi.fn((row) => ({ id: String(row?.id || "") })),
    normalizeUploadRequestFileRow: vi.fn((row) => ({
        id: String(row?.id || ""),
        originalFileName: String(row?.original_file_name || ""),
        queueFileKey: String(row?.queue_file_key || ""),
        canApply: Boolean(row?.can_apply),
        applied: Boolean(row?.applied),
    })),
}));
vi.mock("../../api/_lib/uploadQueueOps.js", () => ({
    findNextPendingUploadFile: vi.fn(),
    getCommandByAuthKey: vi.fn(),
    isUploadStopRequested: vi.fn(async () => false),
    loadUploadRequestSnapshot: vi.fn(),
    markRemainingAsNonProcessed: vi.fn(),
    refreshUploadRequestCounters: vi.fn(),
}));
vi.mock("../../api/_lib/queueS3.js", () => ({
    deleteQueueObject: vi.fn(),
    downloadQueueFileText: vi.fn(),
}));
vi.mock("../../api/_lib/uploadQueueProcessing.js", () => ({
    processUploadQueueFile: vi.fn(),
    applyUploadQueueFileRow: vi.fn(),
}));
vi.mock("../../api/_lib/maintenanceMode.js", () => ({
    checkMaintenanceBlock: vi.fn(async () => ({ blocked: false, state: null })),
}));

import { sql } from "@vercel/postgres";
import {
    findNextPendingUploadFile,
    getCommandByAuthKey,
    loadUploadRequestSnapshot,
    markRemainingAsNonProcessed,
} from "../../api/_lib/uploadQueueOps.js";
import { downloadQueueFileText } from "../../api/_lib/queueS3.js";
import { applyUploadQueueFileRow, processUploadQueueFile } from "../../api/_lib/uploadQueueProcessing.js";
import runHandler from "../../api/points-upload-request-run.js";
import stopHandler from "../../api/points-upload-request-stop.js";
import applyHandler from "../../api/points-upload-request-apply.js";
import closeHandler from "../../api/points-upload-request-close.js";
import { checkMaintenanceBlock } from "../../api/_lib/maintenanceMode.js";

describe("upload request lifecycle handlers", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        checkMaintenanceBlock.mockResolvedValue({ blocked: false, state: null });
    });

    it("run marks remaining as non-processed when stop was requested", async () => {
        getCommandByAuthKey.mockResolvedValueOnce({ id: 10 });
        loadUploadRequestSnapshot
            .mockResolvedValueOnce({
                request: { id: "req_1", status: "processing", stopRequested: true },
                files: [],
            })
            .mockResolvedValueOnce({
                request: { id: "req_1", status: "interrupted" },
                files: [{ id: "f1" }],
            });

        const req = createMockReq({
            method: "POST",
            body: { authKey: "k", requestId: "req_1" },
        });
        const res = createMockRes();
        await runHandler(req, res);

        expect(markRemainingAsNonProcessed).toHaveBeenCalledWith("req_1");
        expect(res.statusCode).toBe(200);
        expect(res.body.request.status).toBe("interrupted");
    });

    it("stop sets stop flag and returns fresh snapshot", async () => {
        getCommandByAuthKey.mockResolvedValueOnce({ id: 10 });
        loadUploadRequestSnapshot
            .mockResolvedValueOnce({ request: { id: "req_1" }, files: [] })
            .mockResolvedValueOnce({ request: { id: "req_1", stopRequested: true }, files: [] });
        sql.mockResolvedValueOnce({ rows: [] });

        const req = createMockReq({
            method: "POST",
            body: { authKey: "k", requestId: "req_1" },
        });
        const res = createMockRes();
        await stopHandler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.request.id).toBe("req_1");
    });

    it("run freezes request during maintenance and returns snapshot", async () => {
        getCommandByAuthKey.mockResolvedValueOnce({ id: 10 });
        loadUploadRequestSnapshot
            .mockResolvedValueOnce({
                request: { id: "req_1", status: "processing", stopRequested: false },
                files: [],
            })
            .mockResolvedValueOnce({
                request: { id: "req_1", status: "freezed", error: "Maintenance." },
                files: [{ id: "f1" }],
            });
        checkMaintenanceBlock.mockResolvedValueOnce({
            blocked: true,
            state: { message: "Maintenance." },
        });
        sql.mockResolvedValueOnce({ rows: [] });

        const req = createMockReq({
            method: "POST",
            body: { authKey: "k", requestId: "req_1" },
        });
        const res = createMockRes();
        await runHandler(req, res);

        expect(markRemainingAsNonProcessed).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(200);
        expect(res.body.request.status).toBe("freezed");
    });

    it("run marks failed processing exceptions as non-applyable", async () => {
        getCommandByAuthKey.mockResolvedValueOnce({ id: 10 });
        loadUploadRequestSnapshot
            .mockResolvedValueOnce({
                request: { id: "req_1", status: "processing", stopRequested: false },
                files: [],
            })
            .mockResolvedValueOnce({
                request: { id: "req_1", status: "failed", error: "boom" },
                files: [{ id: "f1" }],
            });
        findNextPendingUploadFile.mockResolvedValueOnce({
            id: "f1",
            originalFileName: "bench254_1_1.bench",
            queueFileKey: "queue/f1",
        });
        downloadQueueFileText.mockResolvedValueOnce({ ok: true, circuitText: "bench" });
        processUploadQueueFile.mockRejectedValueOnce(new Error("boom"));
        sql
            .mockResolvedValueOnce({ rows: [] }) // set file processing
            .mockResolvedValueOnce({ rows: [] }) // set request processing
            .mockResolvedValueOnce({ rows: [] }) // set file failed
            .mockResolvedValueOnce({ rows: [] }); // set request failed

        const req = createMockReq({
            method: "POST",
            body: { authKey: "k", requestId: "req_1" },
        });
        const res = createMockRes();
        await runHandler(req, res);

        const failedUpdateSql = sql.mock.calls
            .map((call) => String(call[0]?.raw?.join(" ") || ""))
            .find((text) => text.includes("set process_state = 'processed'"));
        expect(failedUpdateSql).toContain("can_apply = false");
        expect(failedUpdateSql).toContain("default_checked = false");
        expect(res.statusCode).toBe(200);
        expect(res.body.request.status).toBe("failed");
    });

    it("apply stores points for selected apply-able files and reports download errors", async () => {
        getCommandByAuthKey.mockResolvedValueOnce({ id: 10 });
        sql
            .mockResolvedValueOnce({ rows: [{ id: "req_1" }] }) // request row
            .mockResolvedValueOnce({
                rows: [
                    { id: "f_ok", original_file_name: "a.bench", queue_file_key: "queue/a", can_apply: true, applied: false },
                    { id: "f_err", original_file_name: "b.bench", queue_file_key: "queue/b", can_apply: true, applied: false },
                ],
            }) // file rows
            .mockResolvedValueOnce({ rows: [] }); // update applied row
        downloadQueueFileText
            .mockResolvedValueOnce({ ok: true, circuitText: "bench" })
            .mockResolvedValueOnce({ ok: false, reason: "download failed" });
        applyUploadQueueFileRow.mockResolvedValueOnce({
            ok: true,
            pointId: "p1",
            finalFileName: "points/p1.bench",
            point: { id: "p1" },
        });
        loadUploadRequestSnapshot.mockResolvedValueOnce({
            request: { id: "req_1" },
            files: [],
        });

        const req = createMockReq({
            method: "POST",
            body: { authKey: "k", requestId: "req_1", fileIds: ["f_ok", "f_err"] },
        });
        const res = createMockRes();
        await applyHandler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.savedPoints).toHaveLength(1);
        expect(res.body.errors).toHaveLength(1);
    });

    it("close cleans up non-applied queue files", async () => {
        getCommandByAuthKey.mockResolvedValueOnce({ id: 10 });
        loadUploadRequestSnapshot
            .mockResolvedValueOnce({
                request: { id: "req_1" },
                files: [
                    { id: "f1", applied: false, queueFileKey: "queue/f1" },
                    { id: "f2", applied: true, queueFileKey: "queue/f2" },
                ],
            })
            .mockResolvedValueOnce({
                request: { id: "req_1", status: "closed" },
                files: [],
            });
        sql
            .mockResolvedValueOnce({ rows: [] }) // disable apply rows
            .mockResolvedValueOnce({ rows: [] }); // update request status

        const req = createMockReq({
            method: "POST",
            body: { authKey: "k", requestId: "req_1" },
        });
        const res = createMockRes();
        await closeHandler(req, res);

        expect(res.statusCode).toBe(200);
    });
});

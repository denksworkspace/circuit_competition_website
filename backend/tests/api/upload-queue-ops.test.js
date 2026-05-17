import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vercel/postgres", () => ({ sql: vi.fn() }));
vi.mock("../../api/_lib/pointsStatus.js", () => ({
    ensurePointsStatusConstraint: vi.fn(),
}));

import { sql } from "@vercel/postgres";
import {
    finalizeUploadRequestPareto,
    isManualApplyCandidate,
    refreshUploadRequestCounters,
    requeueAllStuckProcessingFiles,
    requeueStuckProcessingFiles,
} from "../../api/_lib/uploadQueueOps.js";

describe("uploadQueueOps", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("moves request to waiting_manual_verdict when auto manual window is disabled", async () => {
        sql
            .mockResolvedValueOnce({
                rows: [{
                    auto_manual_window: 0,
                    total_count: 2,
                    done_count: 2,
                    verified_count: 0,
                    pending_count: 0,
                    savable_pending_count: 1,
                    manual_pending_count: 1,
                }],
            })
            .mockResolvedValueOnce({ rows: [] });

        const result = await refreshUploadRequestCounters("req_1");

        expect(result.nextStatus).toBe("waiting_manual_verdict");
        const updateSql = String(sql.mock.calls[1]?.[0]?.raw?.join(" ") || "");
        expect(updateSql).toContain("status = case");
        expect(updateSql).toContain("finished_at = case");
    });

    it("does not complete a request while processing files remain", async () => {
        sql
            .mockResolvedValueOnce({
                rows: [{
                    auto_manual_window: 1,
                    total_count: 2,
                    done_count: 1,
                    verified_count: 0,
                    pending_count: 0,
                    processing_count: 1,
                    savable_pending_count: 0,
                    manual_pending_count: 0,
                }],
            })
            .mockResolvedValueOnce({ rows: [] });

        const result = await refreshUploadRequestCounters("req_processing");

        expect(result.nextStatus).toBe(null);
        expect(result.processingCount).toBe(1);
    });

    it("requeues stuck processing files inside one upload request", async () => {
        sql
            .mockResolvedValueOnce({ rows: [{ id: "file_1" }] })
            .mockResolvedValueOnce({ rows: [] });

        const result = await requeueStuckProcessingFiles("req_1");

        expect(result.requeuedCount).toBe(1);
        expect(sql.mock.calls.length).toBe(2);
        const fileUpdateSql = String(sql.mock.calls[0]?.[0]?.raw?.join(" ") || "");
        expect(fileUpdateSql).toContain("set process_state =");
        expect(fileUpdateSql).toContain("verdict = 'pending'");
        expect(fileUpdateSql).toContain("lower(coalesce(process_state, '')) =");
        const requestUpdateSql = String(sql.mock.calls[1]?.[0]?.raw?.join(" ") || "");
        expect(requestUpdateSql).toContain("set status =");
        expect(requestUpdateSql).toContain("finished_at = null");
    });

    it("requeues all stuck processing files without selecting point rows", async () => {
        sql
            .mockResolvedValueOnce({ rows: [{ request_id: "req_1" }] })
            .mockResolvedValueOnce({ rows: [{ requeued_count: 2, request_count: 1 }] });

        const result = await requeueAllStuckProcessingFiles();

        expect(result).toEqual({
            requeuedCount: 2,
            requestCount: 1,
            requestIds: ["req_1"],
        });
        const query = String(sql.mock.calls[0]?.[0]?.raw?.join(" ") || "");
        expect(query).toContain("from public.upload_request_files");
        expect(query).toContain("join public.upload_requests");
        expect(query).not.toContain("from public.points");
        const updateQuery = String(sql.mock.calls[1]?.[0]?.raw?.join(" ") || "");
        expect(updateQuery).toContain("update public.upload_requests");
    });

    it("treats only apply-able manual review rows as manual apply candidates", () => {
        expect(isManualApplyCandidate({
            applied: false,
            canApply: true,
            manualReviewRequired: true,
        })).toBe(true);
        expect(isManualApplyCandidate({
            applied: false,
            canApply: false,
            manualReviewRequired: true,
        })).toBe(false);
        expect(isManualApplyCandidate({
            applied: true,
            canApply: true,
            manualReviewRequired: true,
        })).toBe(false);
    });

    it("computes uploaded pareto files against all existing benchmark points", async () => {
        sql
            .mockResolvedValueOnce({
                rows: [{
                    id: "file_1",
                    order_index: 0,
                    original_file_name: "bench200_10_10.bench",
                    process_state: "processed",
                    verdict: "verified",
                    can_apply: true,
                    applied: true,
                    point_id: "point_upload",
                    parsed_benchmark: "200",
                    parsed_delay: 10,
                    parsed_area: 10,
                }],
            })
            .mockResolvedValueOnce({
                rows: [{
                    id: "other_command_point",
                    benchmark: "200",
                    delay: 5,
                    area: 5,
                }],
            })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });

        const result = await finalizeUploadRequestPareto({ requestId: "req_1", commandId: 1, commandName: "alice" });

        expect(result.paretoFrontCount).toBe(0);
        const pointsSql = String(sql.mock.calls[1]?.[0]?.raw?.join(" ") || "");
        expect(pointsSql).toContain("from public.points");
        expect(pointsSql).not.toContain("sender =");
    });
});

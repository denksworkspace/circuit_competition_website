import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vercel/postgres", () => ({ sql: vi.fn() }));
vi.mock("../../api/_lib/pointsStatus.js", () => ({
    ensurePointsStatusConstraint: vi.fn(),
}));

import { sql } from "@vercel/postgres";
import { isManualApplyCandidate, refreshUploadRequestCounters } from "../../api/_lib/uploadQueueOps.js";

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
});

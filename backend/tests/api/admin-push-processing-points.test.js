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
vi.mock("../../api/_lib/uploadQueue.js", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        ensureUploadQueueSchema: vi.fn(),
    };
});
vi.mock("../../api/_lib/uploadQueueOps.js", () => ({
    requeueAllStuckProcessingFiles: vi.fn(),
}));

import { sql } from "@vercel/postgres";
import { requeueAllStuckProcessingFiles } from "../../api/_lib/uploadQueueOps.js";
import handler from "../../api/admin-push-processing-points.js";

describe("api/admin-push-processing-points", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("rejects non-admin users", async () => {
        sql.mockResolvedValueOnce({ rows: [{ id: 2, role: "participant" }] });

        const req = createMockReq({
            method: "POST",
            body: { authKey: "user-key" },
        });
        const res = createMockRes();

        await handler(req, res);

        expect(res.statusCode).toBe(403);
        expect(requeueAllStuckProcessingFiles).not.toHaveBeenCalled();
    });

    it("requeues stuck processing upload files for admin", async () => {
        sql.mockResolvedValueOnce({ rows: [{ id: 1, role: "admin" }] });
        requeueAllStuckProcessingFiles.mockResolvedValueOnce({
            requeuedCount: 2,
            requestCount: 1,
            requestIds: ["req_1"],
        });

        const req = createMockReq({
            method: "POST",
            body: { authKey: "admin-key" },
        });
        const res = createMockRes();

        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({
            ok: true,
            requeuedFiles: 2,
            requests: 1,
            requestIds: ["req_1"],
        });
    });
});

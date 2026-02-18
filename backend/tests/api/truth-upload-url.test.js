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
        sql.mockResolvedValueOnce({ rows: [{ id: 1, role: "participant" }] });
        const req = createMockReq({
            method: "POST",
            body: { authKey: "k", fileName: "bench200.truth", fileSize: 10 },
        });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(403);
    });

    it("returns signed url for admin", async () => {
        sql.mockResolvedValueOnce({ rows: [{ id: 1, role: "admin" }] });
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

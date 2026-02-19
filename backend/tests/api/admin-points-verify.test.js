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
vi.mock("../../api/_lib/pointVerification.js", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        downloadPointCircuitText: vi.fn(),
        verifyCircuitWithTruth: vi.fn(),
    };
});

import { sql } from "@vercel/postgres";
import { downloadPointCircuitText, verifyCircuitWithTruth } from "../../api/_lib/pointVerification.js";
import handler from "../../api/admin-points-verify.js";

describe("api/admin-points-verify", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns verification log", async () => {
        sql.mockResolvedValueOnce({ rows: [{ id: 1, role: "admin" }] });
        sql.mockResolvedValueOnce({
            rows: [{ id: "p1", benchmark: "254", file_name: "bench254_1_2_u1_x.bench" }],
        });
        downloadPointCircuitText.mockResolvedValueOnce({ ok: true, circuitText: "candidate" });
        verifyCircuitWithTruth.mockResolvedValueOnce({ ok: true, equivalent: false });

        const req = createMockReq({ method: "POST", body: { authKey: "k", checkerVersion: "ABC" } });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.log[0].recommendedStatus).toBe("failed");
    });
});

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
        verifyCircuitWithTruth: vi.fn(),
    };
});

import { sql } from "@vercel/postgres";
import { verifyCircuitWithTruth } from "../../api/_lib/pointVerification.js";
import handler from "../../api/points-verify.js";

describe("api/points-verify", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("rejects when truth is missing", async () => {
        sql.mockResolvedValueOnce({ rows: [{ id: 1, role: "participant", name: "u1" }] });
        verifyCircuitWithTruth.mockResolvedValueOnce({
            ok: false,
            code: "TRUTH_NOT_FOUND",
            reason: "Truth file not found for benchmark 254.",
        });

        const req = createMockReq({
            method: "POST",
            body: { authKey: "k", benchmark: "254", circuitText: "x", checkerVersion: "ABC" },
        });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(404);
    });

    it("applies status for owned point", async () => {
        sql.mockResolvedValueOnce({ rows: [{ id: 1, role: "participant", name: "u1" }] });
        verifyCircuitWithTruth.mockResolvedValueOnce({ ok: true, equivalent: true });
        sql.mockResolvedValueOnce({ rows: [{ id: "p1", sender: "u1", benchmark: "254", file_name: "f.bench" }] });
        sql.mockResolvedValueOnce({ rows: [] });

        const req = createMockReq({
            method: "POST",
            body: {
                authKey: "k",
                benchmark: "254",
                circuitText: "x",
                checkerVersion: "ABC",
                pointId: "p1",
                applyStatus: true,
            },
        });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe("verified");
    });

    it("caps timeoutSeconds by user verify quota", async () => {
        sql.mockResolvedValueOnce({ rows: [{ id: 1, role: "participant", name: "u1", abc_verify_timeout_seconds: 9 }] });
        verifyCircuitWithTruth.mockResolvedValueOnce({ ok: true, equivalent: true });

        const req = createMockReq({
            method: "POST",
            body: { authKey: "k", benchmark: "254", circuitText: "x", checkerVersion: "ABC", timeoutSeconds: 30 },
        });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(verifyCircuitWithTruth).toHaveBeenCalledWith(
            expect.objectContaining({
                checkerVersion: "ABC",
                timeoutMs: 9000,
                timeoutSeconds: 9,
            })
        );
    });

    it("accepts fast hex checker", async () => {
        sql.mockResolvedValueOnce({ rows: [{ id: 1, role: "participant", name: "u1", abc_verify_timeout_seconds: 9 }] });
        verifyCircuitWithTruth.mockResolvedValueOnce({ ok: true, equivalent: false });

        const req = createMockReq({
            method: "POST",
            body: {
                authKey: "k",
                benchmark: "254",
                circuitText: "x",
                checkerVersion: "ABC_FAST_HEX",
                timeoutSeconds: 5,
            },
        });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(verifyCircuitWithTruth).toHaveBeenCalledWith(
            expect.objectContaining({
                checkerVersion: "ABC_FAST_HEX",
                timeoutMs: 5000,
                timeoutSeconds: 5,
            })
        );
    });
});

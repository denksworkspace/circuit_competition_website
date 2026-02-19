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
        auditCircuitMetrics: vi.fn(),
    };
});

import { sql } from "@vercel/postgres";
import { auditCircuitMetrics, downloadPointCircuitText } from "../../api/_lib/pointVerification.js";
import handler from "../../api/admin-points-audit.js";

describe("api/admin-points-audit", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns only mismatches", async () => {
        sql.mockResolvedValueOnce({ rows: [{ id: 1, role: "admin" }] });
        sql.mockResolvedValueOnce({
            rows: [{ id: "p1", benchmark: "254", delay: 10, area: 20, file_name: "f.bench" }],
        });
        downloadPointCircuitText.mockResolvedValueOnce({ ok: true, circuitText: "bench" });
        auditCircuitMetrics.mockResolvedValueOnce({
            ok: true,
            mismatch: true,
            reason: "delay expected 10, actual 11",
            actualDelay: 11,
            actualArea: 20,
        });

        const req = createMockReq({ method: "POST", body: { authKey: "k" } });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.mismatches).toHaveLength(1);
    });
});

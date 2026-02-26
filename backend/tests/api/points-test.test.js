// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
vi.mock("../../api/_lib/abc.js", () => ({
    runCecBenchTexts: vi.fn(),
}));
vi.mock("../../api/_lib/truthTables.js", () => ({
    getTruthTableByBenchmark: vi.fn(),
}));

import { sql } from "@vercel/postgres";
import { runCecBenchTexts } from "../../api/_lib/abc.js";
import { getTruthTableByBenchmark } from "../../api/_lib/truthTables.js";
import handler from "../../api/points-test.js";

describe("api/points-test", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            text: vi.fn().mockResolvedValue("truth-content"),
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("runs cec for non-admin users too", async () => {
        sql.mockResolvedValueOnce({ rows: [{ id: 1, role: "participant" }] });
        getTruthTableByBenchmark.mockResolvedValueOnce({
            benchmark: "254",
            fileName: "bench254.truth",
            downloadUrl: "https://cdn.example/truth_tables/bench254.truth",
        });
        runCecBenchTexts.mockResolvedValueOnce({
            ok: true,
            equivalent: false,
            output: "Networks are not equivalent.",
        });
        const req = createMockReq({
            method: "POST",
            body: { authKey: "k", benchmark: "254", fileName: "f.bench", circuitText: "x" },
        });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.body.equivalent).toBe(false);
        expect(runCecBenchTexts).toHaveBeenCalledWith(
            expect.objectContaining({
                cecTimeoutSeconds: 60,
            })
        );
    });

    it("runs cec for admin", async () => {
        sql.mockResolvedValueOnce({ rows: [{ id: 1, role: "admin" }] });
        getTruthTableByBenchmark.mockResolvedValueOnce({
            benchmark: "254",
            fileName: "bench254.truth",
            downloadUrl: "https://cdn.example/truth_tables/bench254.truth",
        });
        runCecBenchTexts.mockResolvedValueOnce({
            ok: true,
            equivalent: true,
            output: "Networks are equivalent.",
        });

        const req = createMockReq({
            method: "POST",
            body: { authKey: "k", benchmark: "254", fileName: "f.bench", circuitText: "candidate" },
        });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.equivalent).toBe(true);
        expect(runCecBenchTexts).toHaveBeenCalledWith(
            expect.objectContaining({
                cecTimeoutSeconds: 60,
            })
        );
    });
});

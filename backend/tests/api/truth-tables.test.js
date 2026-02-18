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
vi.mock("../../api/_lib/truthTables.js", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        ensureTruthTablesSchema: vi.fn(),
        benchmarkExists: vi.fn(),
        ensureBenchmarkExists: vi.fn(),
        getTruthTableByBenchmark: vi.fn(),
    };
});
vi.mock("../../api/_lib/actionLogs.js", () => ({
    addActionLog: vi.fn(),
}));

import { sql } from "@vercel/postgres";
import {
    benchmarkExists,
    ensureBenchmarkExists,
    getTruthTableByBenchmark,
} from "../../api/_lib/truthTables.js";
import { addActionLog } from "../../api/_lib/actionLogs.js";
import handler from "../../api/truth-tables.js";

describe("api/truth-tables", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("requires create flag for missing benchmark", async () => {
        sql.mockResolvedValueOnce({ rows: [{ id: 1, role: "admin" }] });
        benchmarkExists.mockResolvedValueOnce(false);

        const req = createMockReq({
            method: "POST",
            body: { authKey: "k", fileName: "bench200.truth" },
        });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(409);
        expect(res.body.code).toBe("BENCHMARK_MISSING");
    });

    it("requires replace flag when truth exists", async () => {
        sql.mockResolvedValueOnce({ rows: [{ id: 1, role: "admin" }] });
        benchmarkExists.mockResolvedValueOnce(true);
        getTruthTableByBenchmark.mockResolvedValueOnce({ benchmark: "200", fileName: "bench200.truth" });

        const req = createMockReq({
            method: "POST",
            body: { authKey: "k", fileName: "bench200.truth" },
        });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(409);
        expect(res.body.code).toBe("TRUTH_EXISTS");
    });

    it("creates benchmark and saves truth", async () => {
        sql.mockResolvedValueOnce({ rows: [{ id: 1, role: "admin" }] });
        benchmarkExists.mockResolvedValueOnce(false);
        getTruthTableByBenchmark.mockResolvedValueOnce(null);
        sql.mockResolvedValueOnce({ rows: [] });

        const req = createMockReq({
            method: "POST",
            body: {
                authKey: "k",
                fileName: "bench200.truth",
                allowCreateBenchmark: true,
            },
        });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(ensureBenchmarkExists).toHaveBeenCalledTimes(1);
        expect(addActionLog).toHaveBeenCalledTimes(1);
    });
});

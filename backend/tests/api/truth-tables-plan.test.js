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
        benchmarkExists: vi.fn(),
        getTruthTableByBenchmark: vi.fn(),
    };
});

import { sql } from "@vercel/postgres";
import { benchmarkExists, getTruthTableByBenchmark } from "../../api/_lib/truthTables.js";
import handler from "../../api/truth-tables-plan.js";

describe("api/truth-tables-plan", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns actions for conflicts and ready files", async () => {
        sql.mockResolvedValueOnce({ rows: [{ id: 1, role: "admin" }] });
        getTruthTableByBenchmark.mockResolvedValueOnce({
            benchmark: "200",
            fileName: "bench200.truth",
        });
        benchmarkExists.mockResolvedValueOnce(true);
        getTruthTableByBenchmark.mockResolvedValueOnce(null);
        benchmarkExists.mockResolvedValueOnce(false);

        const req = createMockReq({
            method: "POST",
            body: {
                authKey: "k",
                fileNames: ["bench200.truth", "bench201.truth"],
            },
        });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.files[0].action).toBe("requires_replace");
        expect(res.body.files[1].action).toBe("requires_create_benchmark");
    });
});

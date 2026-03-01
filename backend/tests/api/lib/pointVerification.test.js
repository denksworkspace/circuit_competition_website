// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../api/_lib/truthTables.js", () => ({
    getTruthTableByBenchmark: vi.fn(),
}));
vi.mock("../../../api/_lib/abc.js", () => ({
    getAigStatsFromBenchText: vi.fn(),
    runCecBenchTexts: vi.fn(),
    runFastHexBenchTexts: vi.fn(),
}));

import { getTruthTableByBenchmark } from "../../../api/_lib/truthTables.js";
import { runCecBenchTexts, runFastHexBenchTexts } from "../../../api/_lib/abc.js";
import {
    CHECKER_ABC,
    CHECKER_ABC_FAST_HEX,
    CHECKER_NONE,
    normalizeCheckerVersion,
    verifyCircuitWithTruth,
} from "../../../api/_lib/pointVerification.js";

describe("api/_lib/pointVerification", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            text: vi.fn().mockResolvedValue("0101"),
        });
    });

    it("normalizes checker versions including fast hex", () => {
        expect(normalizeCheckerVersion("ABC")).toBe(CHECKER_ABC);
        expect(normalizeCheckerVersion("abc_fast_hex")).toBe(CHECKER_ABC_FAST_HEX);
        expect(normalizeCheckerVersion("unknown")).toBe(CHECKER_NONE);
    });

    it("uses fast hex checker when selected", async () => {
        getTruthTableByBenchmark.mockResolvedValueOnce({
            benchmark: "254",
            fileName: "bench254.truth",
            downloadUrl: "https://cdn.example/truth_tables/bench254.truth",
        });
        runFastHexBenchTexts.mockResolvedValueOnce({ ok: true, equivalent: true, output: "ok", script: "fast-script" });

        const result = await verifyCircuitWithTruth({
            benchmark: "254",
            circuitText: "candidate",
            checkerVersion: CHECKER_ABC_FAST_HEX,
            timeoutMs: 10_000,
            timeoutSeconds: 10,
        });

        expect(result.ok).toBe(true);
        expect(result.equivalent).toBe(true);
        expect(runFastHexBenchTexts).toHaveBeenCalledWith(
            expect.objectContaining({
                referenceTruthText: "0101",
                candidateBenchText: "candidate",
            })
        );
        expect(runCecBenchTexts).not.toHaveBeenCalled();
    });

    it("uses cec checker by default", async () => {
        getTruthTableByBenchmark.mockResolvedValueOnce({
            benchmark: "254",
            fileName: "bench254.truth",
            downloadUrl: "https://cdn.example/truth_tables/bench254.truth",
        });
        runCecBenchTexts.mockResolvedValueOnce({ ok: true, equivalent: false, output: "not eq", script: "cec-script" });

        const result = await verifyCircuitWithTruth({
            benchmark: "254",
            circuitText: "candidate",
            timeoutMs: 10_000,
            timeoutSeconds: 10,
        });

        expect(result.ok).toBe(true);
        expect(result.equivalent).toBe(false);
        expect(runCecBenchTexts).toHaveBeenCalledWith(
            expect.objectContaining({
                referenceBenchText: "0101",
                candidateBenchText: "candidate",
            })
        );
    });
});

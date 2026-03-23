// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../api/_lib/uploadQueueToken.js", () => ({
    buildStoredFileName: vi.fn(),
    uid: vi.fn(),
}));
vi.mock("../../../api/_lib/benchInputName.js", () => ({
    parseInputBenchFileName: vi.fn(),
}));
vi.mock("../../../api/_lib/abc.js", () => ({
    getAigStatsFromBenchText: vi.fn(),
}));
vi.mock("../../../api/_lib/duplicateCheck.js", () => ({
    checkDuplicatePointByCircuit: vi.fn(),
}));
vi.mock("../../../api/_lib/pointVerification.js", () => ({
    CHECKER_ABC: "ABC",
    CHECKER_ABC_FAST_HEX: "ABC_FAST_HEX",
    CHECKER_NONE: "none",
    verifyCircuitWithTruth: vi.fn(),
}));
vi.mock("../../../api/_lib/s3Presign.js", () => ({
    buildPresignedPutUrl: vi.fn(),
}));
vi.mock("../../../api/_lib/pointsWrite.js", () => ({
    createPointForCommand: vi.fn(),
}));

import { parseInputBenchFileName } from "../../../api/_lib/benchInputName.js";
import { getAigStatsFromBenchText } from "../../../api/_lib/abc.js";
import { checkDuplicatePointByCircuit } from "../../../api/_lib/duplicateCheck.js";
import { processUploadQueueFile } from "../../../api/_lib/uploadQueueProcessing.js";

describe("api/_lib/uploadQueueProcessing", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("does not preselect manual apply for invalid file names", async () => {
        parseInputBenchFileName.mockReturnValueOnce({ ok: false, error: "Invalid file name." });

        const result = await processUploadQueueFile({
            fileRow: { originalFileName: "bad_name.bench" },
            requestRow: { selectedParser: "none", selectedChecker: "none" },
            command: { name: "team1" },
            circuitText: "bench data",
        });

        expect(result.verdict).toBe("failed");
        expect(result.defaultChecked).toBe(false);
    });

    it("preselects manual apply only for non-verified verdicts", async () => {
        parseInputBenchFileName
            .mockReturnValueOnce({
                ok: true,
                benchmark: 254,
                delay: 15,
                area: 40,
            })
            .mockReturnValueOnce({
                ok: true,
                benchmark: 254,
                delay: 15,
                area: 40,
            });
        getAigStatsFromBenchText.mockResolvedValueOnce({
            ok: true,
            area: 40,
            depth: 15,
        });
        checkDuplicatePointByCircuit.mockResolvedValueOnce({
            duplicate: false,
            blockedByCheckError: false,
        });

        const result = await processUploadQueueFile({
            fileRow: { originalFileName: "bench254_15_40.bench" },
            requestRow: { selectedParser: "ABC", selectedChecker: "none" },
            command: { name: "team1" },
            circuitText: "bench data",
        });

        expect(result.verdict).toBe("non-verified");
        expect(result.defaultChecked).toBe(true);
    });

    it("does not preselect manual apply for duplicates", async () => {
        parseInputBenchFileName
            .mockReturnValueOnce({
                ok: true,
                benchmark: 254,
                delay: 15,
                area: 40,
            })
            .mockReturnValueOnce({
                ok: true,
                benchmark: 254,
                delay: 15,
                area: 40,
            });
        getAigStatsFromBenchText.mockResolvedValueOnce({
            ok: true,
            area: 40,
            depth: 15,
        });
        checkDuplicatePointByCircuit.mockResolvedValueOnce({
            duplicate: true,
            blockedByCheckError: false,
            point: { fileName: "existing.bench" },
        });

        const result = await processUploadQueueFile({
            fileRow: { originalFileName: "bench254_15_40.bench" },
            requestRow: { selectedParser: "ABC", selectedChecker: "none" },
            command: { name: "team1" },
            circuitText: "bench data",
        });

        expect(result.verdict).toBe("duplicate");
        expect(result.defaultChecked).toBe(false);
    });

    it("maps ABC assertion parser crash to user-friendly failed reason", async () => {
        parseInputBenchFileName
            .mockReturnValueOnce({
                ok: true,
                benchmark: 254,
                delay: 15,
                area: 40,
            })
            .mockReturnValueOnce({
                ok: true,
                benchmark: 254,
                delay: 15,
                area: 40,
            });
        getAigStatsFromBenchText.mockResolvedValueOnce({
            ok: false,
            code: "ABC_FAILED",
            message: "Command failed: /usr/local/bin/abc -c read_bench ...",
            output: "abc: src/base/abc/abcFanio.c:92: Abc_ObjAddFanin: Assertion `!Abc_ObjIsNet(pObj)' failed.",
        });
        checkDuplicatePointByCircuit.mockResolvedValueOnce({
            duplicate: false,
            blockedByCheckError: false,
        });

        const result = await processUploadQueueFile({
            fileRow: { originalFileName: "bench254_15_40.bench" },
            requestRow: { selectedParser: "ABC", selectedChecker: "none" },
            command: { name: "team1" },
            circuitText: "bench data",
        });

        expect(result.verdict).toBe("failed");
        expect(result.verdictReason).toBe(
            "parser: Parser failed: the .bench file has an invalid gate/net structure, so ABC could not parse it."
        );
    });
});

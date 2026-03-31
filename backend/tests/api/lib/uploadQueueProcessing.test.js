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

import { buildStoredFileName, uid } from "../../../api/_lib/uploadQueueToken.js";
import { parseInputBenchFileName } from "../../../api/_lib/benchInputName.js";
import { getAigStatsFromBenchText } from "../../../api/_lib/abc.js";
import { checkDuplicatePointByCircuit } from "../../../api/_lib/duplicateCheck.js";
import { buildPresignedPutUrl } from "../../../api/_lib/s3Presign.js";
import { createPointForCommand } from "../../../api/_lib/pointsWrite.js";
import { applyUploadQueueFileRow, processUploadQueueFile } from "../../../api/_lib/uploadQueueProcessing.js";

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

    it("assigns warning verdict for circuits containing both LUT and GND gate calls", async () => {
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
            circuitText: "n1 = LUT(a, b)\nn2 = gnd(n1)\n",
        });

        expect(result.verdict).toBe("warning");
        expect(result.canApply).toBe(true);
        expect(result.defaultChecked).toBe(false);
        expect(result.verdictReason).toContain("LUT and GND");
    });

    it("applies warning verdict rows as non-verified point status", async () => {
        process.env.AWS_ACCESS_KEY_ID = "x";
        process.env.AWS_SECRET_ACCESS_KEY = "y";
        process.env.AWS_REGION = "us-east-1";
        process.env.S3_BUCKET = "points";
        uid.mockReturnValueOnce("pid_1");
        buildStoredFileName.mockReturnValueOnce("bench254_15_40_team1_pid_1.bench");
        buildPresignedPutUrl.mockReturnValueOnce("https://upload.example/points/bench254_15_40_team1_pid_1.bench");
        global.fetch = vi.fn(async () => ({ ok: true }));
        createPointForCommand.mockResolvedValueOnce({
            ok: true,
            point: { id: "pid_1" },
        });

        const result = await applyUploadQueueFileRow({
            command: { name: "team1" },
            requestRow: { description: "schema", totalCount: 1 },
            fileRow: {
                canApply: true,
                applied: false,
                parsedBenchmark: "254",
                parsedDelay: 15,
                parsedArea: 40,
                verdict: "warning",
                checkerVersion: null,
                fileSize: 128,
            },
            circuitText: "n1 = LUT(a, b)\nn2 = gnd(n1)\n",
        });

        expect(result.ok).toBe(true);
        expect(createPointForCommand).toHaveBeenCalledWith(expect.objectContaining({
            status: "non-verified",
        }));
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

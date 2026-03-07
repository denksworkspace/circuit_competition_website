import { describe, expect, it } from "vitest";
import { getBenchFilesError } from "../../src/utils/benchUploadValidation.js";

function file(name, size) {
    return { name, size };
}

describe("getBenchFilesError", () => {
    const formatGb = (value) => String(value / 1024);
    const parseOk = () => ({ ok: true });

    it("returns empty string for empty selection", () => {
        const result = getBenchFilesError({
            files: [],
            maxMultiFileBatchCount: 3,
            maxSingleUploadBytes: 100,
            remainingUploadBytes: 200,
            formatGb,
            parseBenchFileName: parseOk,
        });
        expect(result).toBe("");
    });

    it("fails on too many files", () => {
        const result = getBenchFilesError({
            files: [file("a.bench", 1), file("b.bench", 1), file("c.bench", 1)],
            maxMultiFileBatchCount: 2,
            maxSingleUploadBytes: 100,
            remainingUploadBytes: 200,
            formatGb,
            parseBenchFileName: parseOk,
        });
        expect(result).toBe("Too many files selected. Maximum is 2.");
    });

    it("fails on invalid bench file name", () => {
        const result = getBenchFilesError({
            files: [file("bad.txt", 1)],
            maxMultiFileBatchCount: 2,
            maxSingleUploadBytes: 100,
            remainingUploadBytes: 200,
            formatGb,
            parseBenchFileName: () => ({ ok: false, error: "Invalid name" }),
        });
        expect(result).toBe("Invalid name");
    });

    it("fails on single file size limit", () => {
        const result = getBenchFilesError({
            files: [file("ok.bench", 150)],
            maxMultiFileBatchCount: 2,
            maxSingleUploadBytes: 100,
            remainingUploadBytes: 500,
            formatGb,
            parseBenchFileName: parseOk,
        });
        expect(result).toBe("File is too large. Maximum size is 0.09765625 GB.");
    });

    it("fails on multi-file quota", () => {
        const result = getBenchFilesError({
            files: [file("a.bench", 80), file("b.bench", 80)],
            maxMultiFileBatchCount: 3,
            maxSingleUploadBytes: 100,
            remainingUploadBytes: 100,
            formatGb,
            parseBenchFileName: parseOk,
        });
        expect(result).toBe("Multi-file quota exceeded. Remaining: 0.09765625 GB.");
    });
});

import { describe, expect, it, vi } from "vitest";
import { findIdenticalPointDuplicate } from "../../src/utils/pointUploadHelpers.js";

describe("findIdenticalPointDuplicate", () => {
    it("returns neutral result for invalid benchmark params", async () => {
        const checkDuplicate = vi.fn();
        const result = await findIdenticalPointDuplicate({
            benchmark: "test",
            delay: 10,
            area: 20,
            circuitText: "abc",
            checkDuplicate,
        });
        expect(result).toEqual({
            duplicateInfo: null,
            blockedByCheckError: false,
            errorReason: "",
        });
        expect(checkDuplicate).not.toHaveBeenCalled();
    });

    it("maps duplicate payload", async () => {
        const result = await findIdenticalPointDuplicate({
            benchmark: "200",
            delay: 10,
            area: 20,
            circuitText: "abc",
            checkDuplicate: async () => ({
                duplicate: true,
                point: { id: 42, fileName: "x.bench", sender: "alice" },
            }),
        });
        expect(result).toEqual({
            duplicateInfo: { id: "42", fileName: "x.bench", sender: "alice" },
            blockedByCheckError: false,
            errorReason: "",
        });
    });

    it("returns neutral when no duplicate found", async () => {
        const result = await findIdenticalPointDuplicate({
            benchmark: "200",
            delay: 10,
            area: 20,
            circuitText: "abc",
            checkDuplicate: async () => ({ duplicate: false }),
        });
        expect(result).toEqual({
            duplicateInfo: null,
            blockedByCheckError: false,
            errorReason: "",
        });
    });

    it("marks blockedByCheckError for non-abort errors", async () => {
        const result = await findIdenticalPointDuplicate({
            benchmark: "200",
            delay: 10,
            area: 20,
            circuitText: "abc",
            checkDuplicate: async () => {
                throw new Error("boom");
            },
        });
        expect(result).toEqual({
            duplicateInfo: null,
            blockedByCheckError: true,
            errorReason: "boom",
        });
    });

    it("rethrows AbortError", async () => {
        await expect(
            findIdenticalPointDuplicate({
                benchmark: "200",
                delay: 10,
                area: 20,
                circuitText: "abc",
                checkDuplicate: async () => {
                    const err = new Error("aborted");
                    err.name = "AbortError";
                    throw err;
                },
            })
        ).rejects.toMatchObject({ name: "AbortError" });
    });
});

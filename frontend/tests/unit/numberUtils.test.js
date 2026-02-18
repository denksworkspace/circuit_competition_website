// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { describe, expect, it } from "vitest";
import { clamp, formatIntNoGrouping, parsePosIntCapped } from "../../src/utils/numberUtils.js";

describe("numberUtils", () => {
    describe("clamp", () => {
        it("returns value inside bounds", () => {
            expect(clamp(5, 1, 10)).toBe(5);
        });

        it("clamps below lower bound", () => {
            expect(clamp(-1, 0, 9)).toBe(0);
        });

        it("clamps above upper bound", () => {
            expect(clamp(11, 0, 9)).toBe(9);
        });
    });

    describe("formatIntNoGrouping", () => {
        it("formats finite integer without separators", () => {
            expect(formatIntNoGrouping(1234567)).toBe("1234567");
        });

        it("truncates decimals", () => {
            expect(formatIntNoGrouping(42.99)).toBe("42");
        });

        it("returns empty string for non-finite values", () => {
            expect(formatIntNoGrouping(Number.NaN)).toBe("");
            expect(formatIntNoGrouping(Number.POSITIVE_INFINITY)).toBe("");
        });
    });

    describe("parsePosIntCapped", () => {
        it("parses valid integer inside cap", () => {
            expect(parsePosIntCapped("123", 1000)).toBe(123);
        });

        it("rejects empty string and non-digits", () => {
            expect(parsePosIntCapped("", 1000)).toBeNull();
            expect(parsePosIntCapped(" 12", 1000)).toBeNull();
            expect(parsePosIntCapped("12a", 1000)).toBeNull();
            expect(parsePosIntCapped("-5", 1000)).toBeNull();
        });

        it("rejects zero, over-cap and unsafe integers", () => {
            expect(parsePosIntCapped("0", 1000)).toBeNull();
            expect(parsePosIntCapped("1001", 1000)).toBeNull();
            expect(parsePosIntCapped("9007199254740993", Number.MAX_SAFE_INTEGER)).toBeNull();
        });
    });
});

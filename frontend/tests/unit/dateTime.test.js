import { describe, expect, it } from "vitest";
import { formatPointCreatedAt } from "../../src/utils/dateTime.js";

describe("dateTime", () => {
    it("formats a valid point createdAt value", () => {
        expect(formatPointCreatedAt("2026-04-10T12:34:56.000Z")).not.toBe("unknown");
    });

    it("returns unknown for empty or invalid values", () => {
        expect(formatPointCreatedAt("")).toBe("unknown");
        expect(formatPointCreatedAt("not-a-date")).toBe("unknown");
    });
});

import { describe, expect, it, vi } from "vitest";
import { chooseAreaSmartFromParetoFront, randInt, randomChoice } from "../../src/utils/testPointUtils.js";

describe("testPointUtils", () => {
    it("randInt includes both boundaries", () => {
        for (let i = 0; i < 50; i += 1) {
            const value = randInt(3, 5);
            expect(value).toBeGreaterThanOrEqual(3);
            expect(value).toBeLessThanOrEqual(5);
        }
    });

    it("randomChoice returns an element from array", () => {
        const items = ["a", "b", "c"];
        for (let i = 0; i < 20; i += 1) {
            expect(items).toContain(randomChoice(items));
        }
    });

    it("chooseAreaSmartFromParetoFront returns valid range when no neighbors", () => {
        for (let i = 0; i < 20; i += 1) {
            const value = chooseAreaSmartFromParetoFront([], 10);
            expect(value).toBeGreaterThanOrEqual(100);
            expect(value).toBeLessThanOrEqual(1000);
        }
    });

    it("chooseAreaSmartFromParetoFront handles both neighbors with deterministic branch", () => {
        const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.1);
        const value = chooseAreaSmartFromParetoFront(
            [
                { delay: 10, area: 200 },
                { delay: 30, area: 600 },
            ],
            20
        );
        expect(value).toBeGreaterThanOrEqual(200);
        expect(value).toBeLessThanOrEqual(600);
        randomSpy.mockRestore();
    });

    it("chooseAreaSmartFromParetoFront handles one side and cap logic", () => {
        const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.9);
        const value = chooseAreaSmartFromParetoFront([{ delay: 10, area: 10_000 }], 20);
        expect(value).toBeGreaterThanOrEqual(1000);
        expect(value).toBeLessThanOrEqual(1000);
        randomSpy.mockRestore();
    });
});

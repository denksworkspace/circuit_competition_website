import { describe, expect, it } from "vitest";
import {
    buildFixedIntervalEvents,
    calculateActiveSecondsFromEvents,
    estimateModeCu,
    estimateServerCuModes,
} from "../../../api/_lib/cuCostSimulator.js";

describe("api/_lib/cuCostSimulator", () => {
    it("returns zero active time when no events are present", () => {
        const result = estimateModeCu({
            eventTimesSeconds: [],
            periodSeconds: 24 * 60 * 60,
            keepAliveSeconds: 300,
            cuPerActiveHour: 0.25,
        });
        expect(result.activeSeconds).toBe(0);
        expect(result.cuHours).toBe(0);
    });

    it("saturates a day when events are too frequent for autosuspend", () => {
        const events = buildFixedIntervalEvents({
            periodSeconds: 24 * 60 * 60,
            everySeconds: 15,
        });
        const activeSeconds = calculateActiveSecondsFromEvents({
            eventTimesSeconds: events,
            periodSeconds: 24 * 60 * 60,
            keepAliveSeconds: 300,
        });
        expect(activeSeconds).toBe(24 * 60 * 60);

        const result = estimateModeCu({
            eventTimesSeconds: events,
            periodSeconds: 24 * 60 * 60,
            keepAliveSeconds: 300,
            cuPerActiveHour: 0.25,
        });
        expect(result.activeHours).toBe(24);
        expect(result.cuHours).toBe(6);
    });

    it("returns passive and active projections in one call", () => {
        const passive = buildFixedIntervalEvents({
            periodSeconds: 24 * 60 * 60,
            everySeconds: 60 * 60,
        });
        const active = buildFixedIntervalEvents({
            periodSeconds: 24 * 60 * 60,
            everySeconds: 30,
        });
        const projection = estimateServerCuModes({
            passiveEventTimesSeconds: passive,
            activeEventTimesSeconds: active,
            periodSeconds: 24 * 60 * 60,
            keepAliveSeconds: 300,
            cuPerActiveHour: 0.25,
        });
        expect(projection.passive.cuHours).toBeGreaterThanOrEqual(0);
        expect(projection.active.cuHours).toBeGreaterThan(projection.passive.cuHours);
    });
});


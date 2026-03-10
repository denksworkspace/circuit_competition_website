import { describe, expect, it } from "vitest";
import { parseInputBenchFileName } from "../../../api/_lib/benchInputName.js";

describe("parseInputBenchFileName", () => {
    it("accepts a queue-prefixed file name and parses only the original tail", () => {
        expect(parseInputBenchFileName("f_12345_bench254_15_40.bench")).toEqual({
            ok: true,
            benchmark: 254,
            delay: 15,
            area: 40,
            fileName: "bench254_15_40.bench",
        });
    });
});

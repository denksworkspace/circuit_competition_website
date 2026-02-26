// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.

const BENCH_INPUT_NAME_RE = /^(bench|ex)(2\d\d)_(\d+)_(\d+)\.bench$/i;
const MAX_VALUE = 1_000_000_000;

export function parseInputBenchFileName(fileNameRaw) {
    const fileName = String(fileNameRaw || "").trim();
    if (!fileName) {
        return { ok: false, error: "Empty file name." };
    }

    const match = fileName.match(BENCH_INPUT_NAME_RE);
    if (!match) {
        return {
            ok: false,
            error: "Invalid file name pattern. Expected: bench{200..299}_<delay>_<area>.bench or ex{200..299}_<delay>_<area>.bench",
        };
    }

    const benchmark = Number(match[2]);
    const delay = Number(match[3]);
    const area = Number(match[4]);

    if (!Number.isSafeInteger(benchmark) || benchmark < 200 || benchmark > 299) {
        return { ok: false, error: "Benchmark must be in range 200..299." };
    }
    if (!Number.isSafeInteger(delay) || delay < 0 || delay > MAX_VALUE) {
        return { ok: false, error: "Delay must be an integer in range 0..1e9." };
    }
    if (!Number.isSafeInteger(area) || area < 0 || area > MAX_VALUE) {
        return { ok: false, error: "Area must be an integer in range 0..1e9." };
    }

    return {
        ok: true,
        benchmark,
        delay,
        area,
        fileName: `bench${benchmark}_${delay}_${area}.bench`,
    };
}

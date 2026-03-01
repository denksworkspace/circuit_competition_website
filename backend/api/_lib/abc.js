// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
/* global process */
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_ABC_TIMEOUT_MS = 60_000;
const DEFAULT_ABC_BINARY = "abc";

function quoteAbcPath(filePath) {
    return `"${String(filePath).replace(/"/g, '\\"')}"`;
}

function parseIntegerMetric(source, patterns) {
    const text = String(source || "");
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (!match) continue;
        const value = Number(match[1]);
        if (Number.isFinite(value)) return Math.trunc(value);
    }
    return null;
}

function looksLikeTruthTableText(source) {
    const text = String(source || "");
    const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    if (lines.length < 1) return false;
    if (!lines.every((line) => /^[01]+$/.test(line))) return false;
    const width = lines[0].length;
    if (!width) return false;
    if (!lines.every((line) => line.length === width)) return false;
    return true;
}

function normalizeHexTruthText(source) {
    return String(source || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .join("\n")
        .toLowerCase();
}

export function parseAigStatsFromOutput(output) {
    const merged = String(output || "");

    const area = parseIntegerMetric(merged, [
        /\barea\s*[:=]\s*([0-9]+)/i,
        /\band\s*[:=]\s*([0-9]+)/i,
    ]);
    const depth = parseIntegerMetric(merged, [
        /\bdepth\s*[:=]\s*([0-9]+)/i,
        /\blev\s*[:=]\s*([0-9]+)/i,
    ]);

    return {
        area,
        depth,
    };
}

export function parseCecResultFromOutput(output) {
    const text = String(output || "");
    const hasNotEquivalent = /\bnot\s+equivalent\b/i.test(text) || /\bNOT\s+EQUIVALENT\b/.test(text);
    const hasEquivalent = /\bequivalent\b/i.test(text);
    return {
        equivalent: hasEquivalent && !hasNotEquivalent,
    };
}

export async function runAbcScript(script, { timeoutMs = DEFAULT_ABC_TIMEOUT_MS, signal = null } = {}) {
    const abcBinary = String(process.env.ABC_BINARY || DEFAULT_ABC_BINARY).trim() || DEFAULT_ABC_BINARY;
    try {
        const execOptions = {
            timeout: timeoutMs,
            killSignal: "SIGKILL",
            maxBuffer: 16 * 1024 * 1024,
        };
        if (signal && typeof signal === "object" && typeof signal.aborted === "boolean") {
            execOptions.signal = signal;
        }
        const { stdout, stderr } = await execFileAsync(abcBinary, ["-c", script], execOptions);
        return {
            ok: true,
            output: `${stdout || ""}\n${stderr || ""}`.trim(),
        };
    } catch (error) {
        const errorOutput = `${error?.stdout || ""}\n${error?.stderr || ""}`.trim();
        if (error?.name === "AbortError" || error?.code === "ABORT_ERR") {
            return {
                ok: false,
                code: "ABC_ABORTED",
                message: "ABC was aborted.",
                output: errorOutput,
            };
        }
        if (error?.code === "ENOENT") {
            return {
                ok: false,
                code: "ABC_NOT_FOUND",
                message: `ABC binary not found: ${abcBinary}`,
                output: errorOutput,
            };
        }
        if (error?.killed) {
            return {
                ok: false,
                code: "ABC_TIMEOUT",
                message: `ABC timed out after ${timeoutMs} ms.`,
                output: errorOutput,
            };
        }
        return {
            ok: false,
            code: "ABC_FAILED",
            message: String(error?.message || "ABC command failed."),
            output: errorOutput,
        };
    }
}

async function withTempBenchFiles(fileMap, action) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "abc-"));
    try {
        const absolute = {};
        for (const [name, content] of Object.entries(fileMap)) {
            const fullPath = path.join(dir, name);
            await fs.writeFile(fullPath, content, "utf8");
            absolute[name] = fullPath;
        }
        return await action(absolute);
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
}

export async function getAigStatsFromBenchText(
    circuitText,
    { timeoutMs = DEFAULT_ABC_TIMEOUT_MS, signal = null, onProgress = null } = {}
) {
    return await withTempBenchFiles({ "input.bench": String(circuitText || "") }, async (files) => {
        if (typeof onProgress === "function") onProgress("metrics");
        const script = `read_bench ${quoteAbcPath(files["input.bench"])}; strash; ps`;
        const run = await runAbcScript(script, { timeoutMs, signal });
        if (!run.ok) return run;

        const stats = parseAigStatsFromOutput(run.output);
        if (!Number.isInteger(stats.area) || !Number.isInteger(stats.depth)) {
            return {
                ok: false,
                code: "ABC_PARSE_ERROR",
                message: "Failed to parse area/depth from ABC output.",
                output: run.output,
            };
        }
        return {
            ok: true,
            area: stats.area,
            depth: stats.depth,
            output: run.output,
        };
    });
}

export async function runCecBenchTexts({
    referenceBenchText,
    candidateBenchText,
    timeoutMs = DEFAULT_ABC_TIMEOUT_MS,
    cecTimeoutSeconds = null,
    onProgress = null,
    signal = null,
}) {
    return await withTempBenchFiles(
        {
            "reference.raw": String(referenceBenchText || ""),
            "candidate.bench": String(candidateBenchText || ""),
        },
        async (files) => {
            const parsedCecTimeoutSeconds = Number(cecTimeoutSeconds);
            const effectiveCecTimeoutSeconds = Number.isFinite(parsedCecTimeoutSeconds) && parsedCecTimeoutSeconds > 0
                ? Math.max(1, Math.floor(parsedCecTimeoutSeconds))
                : Math.max(1, Math.floor(timeoutMs / 1000));
            const cecCommand = `cec -T ${effectiveCecTimeoutSeconds} -n`;
            const report = (status) => {
                if (typeof onProgress === "function") onProgress(status);
            };
            if (looksLikeTruthTableText(referenceBenchText)) {
                const truthAsBench = `${files["reference.raw"]}.bench`;
                report("read_truth");
                const prepareScript = `read_truth -x -f ${quoteAbcPath(files["reference.raw"])}; strash; write_bench ${quoteAbcPath(truthAsBench)}`;
                const prepared = await runAbcScript(prepareScript, { timeoutMs, signal });
                if (!prepared.ok) return prepared;

                report("cec");
                const cecScript = `${cecCommand} ${quoteAbcPath(truthAsBench)} ${quoteAbcPath(files["candidate.bench"])}`;
                const checked = await runAbcScript(cecScript, { timeoutMs, signal });
                if (!checked.ok) return checked;

                const parsed = parseCecResultFromOutput(checked.output);
                report("done");
                return {
                    ok: true,
                    equivalent: parsed.equivalent,
                    output: `${prepared.output}\n${checked.output}`.trim(),
                    script: `${prepareScript}; ${cecScript}`,
                };
            }

            report("cec");
            const script = `${cecCommand} ${quoteAbcPath(files["reference.raw"])} ${quoteAbcPath(files["candidate.bench"])}`;
            const run = await runAbcScript(script, { timeoutMs, signal });
            if (!run.ok) return run;
            const parsed = parseCecResultFromOutput(run.output);
            report("done");
            return {
                ok: true,
                equivalent: parsed.equivalent,
                output: run.output,
                script,
            };
        }
    );
}

export async function runFastHexBenchTexts({
    referenceTruthText,
    candidateBenchText,
    timeoutMs = DEFAULT_ABC_TIMEOUT_MS,
    onProgress = null,
    signal = null,
}) {
    return await withTempBenchFiles(
        {
            "reference.truth": String(referenceTruthText || ""),
            "candidate.bench": String(candidateBenchText || ""),
        },
        async (files) => {
            if (!looksLikeTruthTableText(referenceTruthText)) {
                return {
                    ok: false,
                    code: "TRUTH_FORMAT_UNSUPPORTED",
                    message: "Truth input must be a binary truth-table text.",
                    output: "",
                };
            }

            const report = (status) => {
                if (typeof onProgress === "function") onProgress(status);
            };

            const referenceHexPath = `${files["reference.truth"]}.hex`;
            const candidateHexPath = `${files["candidate.bench"]}.hex`;

            report("truth_to_hex");
            const truthScript = `read_truth -x -f ${quoteAbcPath(files["reference.truth"])}; strash; &get; &write_truth ${quoteAbcPath(referenceHexPath)}`;
            const truthRun = await runAbcScript(truthScript, { timeoutMs, signal });
            if (!truthRun.ok) return truthRun;

            report("bench_to_hex");
            const benchScript = `read_bench ${quoteAbcPath(files["candidate.bench"])}; strash; &get; &write_truth ${quoteAbcPath(candidateHexPath)}`;
            const benchRun = await runAbcScript(benchScript, { timeoutMs, signal });
            if (!benchRun.ok) return benchRun;

            const [referenceHexRaw, candidateHexRaw] = await Promise.all([
                fs.readFile(referenceHexPath, "utf8"),
                fs.readFile(candidateHexPath, "utf8"),
            ]);
            const referenceHex = normalizeHexTruthText(referenceHexRaw);
            const candidateHex = normalizeHexTruthText(candidateHexRaw);
            if (!referenceHex || !candidateHex) {
                return {
                    ok: false,
                    code: "ABC_PARSE_ERROR",
                    message: "Failed to derive hex truth tables from ABC output.",
                    output: `${truthRun.output}\n${benchRun.output}`.trim(),
                    script: `${truthScript}; ${benchScript}`,
                };
            }

            report("hex_compare");
            const equivalent = referenceHex === candidateHex;
            report("done");

            return {
                ok: true,
                equivalent,
                referenceHex,
                candidateHex,
                output: `${truthRun.output}\n${benchRun.output}`.trim(),
                script: `${truthScript}; ${benchScript}; [hex-compare]`,
            };
        }
    );
}

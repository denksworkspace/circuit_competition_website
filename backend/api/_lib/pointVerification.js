// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { buildDownloadUrl } from "./points.js";
import { getTruthTableByBenchmark } from "./truthTables.js";
import { getAigStatsFromBenchText, runCecBenchTexts, runFastHexBenchTexts } from "./abc.js";

export const CHECKER_NONE = "none";
export const CHECKER_ABC = "ABC";
export const CHECKER_ABC_FAST_HEX = "ABC_FAST_HEX";

export function normalizeCheckerVersion(rawChecker) {
    const checker = String(rawChecker || "").trim().toUpperCase();
    if (checker === CHECKER_ABC) return CHECKER_ABC;
    if (checker === CHECKER_ABC_FAST_HEX) return CHECKER_ABC_FAST_HEX;
    return CHECKER_NONE;
}

export async function downloadPointCircuitText(fileName, { signal = null } = {}) {
    const downloadUrl = buildDownloadUrl(fileName);
    if (!downloadUrl) {
        return {
            ok: false,
            reason: "Download URL is not configured.",
        };
    }
    const response = await fetch(downloadUrl, signal ? { signal } : undefined);
    if (!response.ok) {
        return {
            ok: false,
            reason: "Failed to download point file.",
        };
    }
    return {
        ok: true,
        circuitText: await response.text(),
    };
}

export async function verifyCircuitWithTruth({
    benchmark,
    circuitText,
    checkerVersion = CHECKER_ABC,
    timeoutMs,
    timeoutSeconds = null,
    onProgress = null,
    signal = null,
}) {
    const truth = await getTruthTableByBenchmark(benchmark);
    if (!truth || !truth.downloadUrl) {
        return {
            ok: false,
            code: "TRUTH_NOT_FOUND",
            reason: `Truth file not found for benchmark ${benchmark}.`,
        };
    }

    const truthRes = await fetch(truth.downloadUrl);
    if (!truthRes.ok) {
        return {
            ok: false,
            code: "TRUTH_DOWNLOAD_FAILED",
            reason: `Failed to download truth file for benchmark ${benchmark}.`,
        };
    }
    const truthText = await truthRes.text();
    const run = checkerVersion === CHECKER_ABC_FAST_HEX
        ? await runFastHexBenchTexts({
            referenceTruthText: truthText,
            candidateBenchText: circuitText,
            timeoutMs,
            onProgress,
            signal,
        })
        : await runCecBenchTexts({
            referenceBenchText: truthText,
            candidateBenchText: circuitText,
            timeoutMs,
            cecTimeoutSeconds: timeoutSeconds,
            onProgress,
            signal,
        });
    if (!run.ok) {
        return {
            ok: false,
            code: run.code || (checkerVersion === CHECKER_ABC_FAST_HEX ? "FAST_HEX_FAILED" : "CEC_FAILED"),
            reason: run.message || (checkerVersion === CHECKER_ABC_FAST_HEX ? "Fast HEX check failed." : "CEC failed."),
        };
    }
    return {
        ok: true,
        equivalent: run.equivalent,
        output: run.output,
        script: run.script || "",
    };
}

export async function auditCircuitMetrics({ delay, area, circuitText, timeoutMs, signal = null, onProgress = null }) {
    const stats = await getAigStatsFromBenchText(circuitText, { timeoutMs, signal, onProgress });
    if (!stats.ok) {
        return {
            ok: false,
            reason: stats.message || "ABC get_aig_stat failed.",
        };
    }
    const mismatches = [];
    if (Number(stats.depth) !== Number(delay)) {
        mismatches.push(`delay expected ${delay}, actual ${stats.depth}`);
    }
    if (Number(stats.area) !== Number(area)) {
        mismatches.push(`area expected ${area}, actual ${stats.area}`);
    }
    return {
        ok: true,
        mismatch: mismatches.length > 0,
        reason: mismatches.join("; "),
        actualDelay: stats.depth,
        actualArea: stats.area,
    };
}

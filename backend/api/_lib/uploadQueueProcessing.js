// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { buildStoredFileName, uid } from "./uploadQueueToken.js";
import { parseInputBenchFileName } from "./benchInputName.js";
import { getAigStatsFromBenchText } from "./abc.js";
import { checkDuplicatePointByCircuit } from "./duplicateCheck.js";
import { verifyCircuitWithTruth, CHECKER_ABC, CHECKER_ABC_FAST_HEX, CHECKER_NONE } from "./pointVerification.js";
import { buildPresignedPutUrl } from "./s3Presign.js";
import { createPointForCommand } from "./pointsWrite.js";
import {
    FILE_PROCESS_STATE_PROCESSED,
    FILE_VERDICT_BLOCKED,
    FILE_VERDICT_DUPLICATE,
    FILE_VERDICT_FAILED,
    FILE_VERDICT_NON_VERIFIED,
    FILE_VERDICT_VERIFIED,
} from "./uploadQueue.js";

function normalizeParserSelection(raw) {
    return String(raw || "").trim().toUpperCase() === "ABC" ? "ABC" : "none";
}

function normalizeCheckerSelection(raw) {
    const checker = String(raw || "").trim().toUpperCase();
    if (checker === CHECKER_ABC_FAST_HEX) return CHECKER_ABC_FAST_HEX;
    if (checker === CHECKER_ABC) return CHECKER_ABC;
    return CHECKER_NONE;
}

function isParserNonVerdictReason(reasonRaw) {
    const reason = String(reasonRaw || "").toLowerCase();
    if (!reason) return true;
    return (
        reason.includes("timed out")
        || reason.includes("timeout")
        || reason.includes("failed to compute metrics")
        || reason.includes("body too large")
        || reason.includes("failed to fetch")
        || reason.includes("network")
    );
}

function toAbortError(message = "Upload processing aborted.") {
    const error = new Error(message);
    error.name = "AbortError";
    return error;
}

function throwIfAborted(signal) {
    if (signal?.aborted) {
        throw toAbortError();
    }
}

async function runParser({ circuitText, originalFileName, timeoutMs, reportPhase, signal }) {
    throwIfAborted(signal);
    const parsed = parseInputBenchFileName(originalFileName);
    if (!parsed.ok) {
        return {
            parserKind: "failed",
            parsed: null,
            reason: parsed.error,
        };
    }

    reportPhase("parser");
    const stats = await getAigStatsFromBenchText(circuitText, { timeoutMs, signal });
    if (!stats.ok && (signal?.aborted || String(stats.code || "").toUpperCase() === "ABC_ABORTED")) {
        throw toAbortError();
    }
    if (!stats.ok) {
        const reason = stats.message || "Failed to compute metrics with ABC.";
        return {
            parserKind: isParserNonVerdictReason(reason) ? "non-verdict" : "failed",
            parsed,
            reason,
        };
    }

    const mismatches = [];
    if (Number(stats.area) !== Number(parsed.area)) {
        mismatches.push(`area expected ${parsed.area}, actual ${stats.area}`);
    }
    if (Number(stats.depth) !== Number(parsed.delay)) {
        mismatches.push(`delay expected ${parsed.delay}, actual ${stats.depth}`);
    }
    if (mismatches.length === 0) {
        return { parserKind: "pass", parsed, reason: "" };
    }
    const paretoBetterOrEqual = Number(stats.area) <= Number(parsed.area) && Number(stats.depth) <= Number(parsed.delay);
    if (paretoBetterOrEqual) {
        return {
            parserKind: "pass-adjusted",
            parsed: {
                ...parsed,
                area: Number(stats.area),
                delay: Number(stats.depth),
            },
            reason: `Parser adjusted metrics to delay=${stats.depth}, area=${stats.area}.`,
        };
    }
    return {
        parserKind: "failed",
        parsed,
        reason: `Metric mismatch: ${mismatches.join("; ")}`,
    };
}

async function runChecker({
    enabled,
    checkerVersion,
    benchmark,
    circuitText,
    timeoutMs,
    timeoutSeconds,
    reportPhase,
    signal,
}) {
    throwIfAborted(signal);
    if (!enabled) {
        return {
            checkerVerdict: null,
            checkerVersion: null,
            checkerErrorReason: "",
        };
    }
    reportPhase("checker");
    const verify = await verifyCircuitWithTruth({
        benchmark,
        circuitText,
        checkerVersion,
        timeoutMs,
        timeoutSeconds,
        signal,
    });
    if (!verify.ok && (signal?.aborted || String(verify.code || "").toUpperCase() === "ABC_ABORTED")) {
        throw toAbortError();
    }
    if (!verify.ok) {
        return {
            checkerVerdict: null,
            checkerVersion,
            checkerErrorReason: String(verify.reason || verify.code || "checker request failed"),
        };
    }
    return {
        checkerVerdict: Boolean(verify.equivalent),
        checkerVersion,
        checkerErrorReason: "",
    };
}

function computeFinalStatus({ parserKind, checkerEnabled, checkerVerdict }) {
    if (parserKind === "failed" || checkerVerdict === false) return FILE_VERDICT_FAILED;
    if (checkerEnabled && checkerVerdict === true && (parserKind === "pass" || parserKind === "pass-adjusted")) {
        return FILE_VERDICT_VERIFIED;
    }
    return FILE_VERDICT_NON_VERIFIED;
}

function readAwsConfig() {
    return {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN,
        region: process.env.AWS_REGION,
        bucket: process.env.S3_BUCKET,
    };
}

async function uploadPointFileToPrimaryBucket(fileName, circuitText, { signal = null } = {}) {
    const { accessKeyId, secretAccessKey, sessionToken, region, bucket } = readAwsConfig();
    if (!accessKeyId || !secretAccessKey || !region || !bucket) {
        throw new Error("S3 configuration is not complete.");
    }
    const uploadUrl = buildPresignedPutUrl({
        bucket,
        region,
        accessKeyId,
        secretAccessKey,
        sessionToken,
        objectKey: `points/${fileName}`,
        expiresSeconds: 900,
    });
    throwIfAborted(signal);
    const response = await fetch(uploadUrl, {
        method: "PUT",
        ...(signal ? { signal } : {}),
        body: circuitText,
    });
    throwIfAborted(signal);
    if (!response.ok) {
        throw new Error("Failed to upload file to primary S3 bucket.");
    }
}

export async function processUploadQueueFile({
    fileRow,
    requestRow,
    command,
    circuitText,
    reportPhase = () => {},
    signal = null,
}) {
    const parserSelection = normalizeParserSelection(requestRow.selectedParser);
    const checkerSelection = normalizeCheckerSelection(requestRow.selectedChecker);
    const parserEnabled = parserSelection === "ABC";
    const checkerEnabled = checkerSelection !== CHECKER_NONE;
    const parserTimeoutMs = Math.max(1, Number(requestRow.parserTimeoutSeconds || 60)) * 1000;
    const checkerTimeoutSeconds = Math.max(1, Number(requestRow.checkerTimeoutSeconds || 60));

    const parsedInputName = parseInputBenchFileName(fileRow.originalFileName);
    const parserOut = parserEnabled
        ? await runParser({
            circuitText,
            originalFileName: fileRow.originalFileName,
            timeoutMs: parserTimeoutMs,
            reportPhase,
            signal,
        })
        : {
            parserKind: "pass",
            parsed: parsedInputName.ok ? parsedInputName : null,
            reason: "",
        };

    if (!parserOut.parsed) {
        return {
            processState: FILE_PROCESS_STATE_PROCESSED,
            verdict: FILE_VERDICT_FAILED,
            verdictReason: String(parserOut.reason || "Invalid file name."),
            canApply: true,
            defaultChecked: false,
            checkerVersion: null,
            parsedBenchmark: null,
            parsedDelay: null,
            parsedArea: null,
            finalFileName: null,
            pointId: null,
            applied: false,
        };
    }

    throwIfAborted(signal);
    const checkerOut = await runChecker({
        enabled: checkerEnabled,
        checkerVersion: checkerSelection,
        benchmark: String(parserOut.parsed.benchmark || ""),
        circuitText,
        timeoutMs: checkerTimeoutSeconds * 1000,
        timeoutSeconds: checkerTimeoutSeconds,
        reportPhase,
        signal,
    });

    throwIfAborted(signal);
    const finalStatus = computeFinalStatus({
        parserKind: parserOut.parserKind,
        checkerEnabled,
        checkerVerdict: checkerOut.checkerVerdict,
    });

    const duplicateCheck = await checkDuplicatePointByCircuit({
        benchmark: parserOut.parsed.benchmark,
        delay: parserOut.parsed.delay,
        area: parserOut.parsed.area,
        circuitText,
    });
    throwIfAborted(signal);
    let verdict = finalStatus;
    let verdictReason = "";
    if (duplicateCheck.blockedByCheckError) {
        verdict = FILE_VERDICT_BLOCKED;
        verdictReason = duplicateCheck.errorReason || "Failed to verify duplicates against existing points.";
    } else if (duplicateCheck.duplicate) {
        verdict = FILE_VERDICT_DUPLICATE;
        verdictReason = `Identical file hash for same delay+area already exists: ${duplicateCheck?.point?.fileName || duplicateCheck?.point?.id || "existing point"}.`;
    } else if (finalStatus === FILE_VERDICT_FAILED) {
        if (parserOut.parserKind === "failed") {
            verdictReason = `parser: ${parserOut.reason || "failed to parse metrics"}`;
        } else if (checkerOut.checkerVerdict === false) {
            verdictReason = "checker: schemes are not equivalent";
        } else if (checkerOut.checkerErrorReason) {
            verdictReason = `checker: ${checkerOut.checkerErrorReason}`;
        } else {
            verdictReason = "checker/parser failed";
        }
    } else if (finalStatus === FILE_VERDICT_NON_VERIFIED) {
        verdictReason = checkerOut.checkerErrorReason || parserOut.reason || "verification skipped or checker unavailable";
    }

    const canApply = verdict !== FILE_VERDICT_VERIFIED || duplicateCheck.duplicate || duplicateCheck.blockedByCheckError;
    const defaultChecked = verdict === FILE_VERDICT_NON_VERIFIED;

    let pointId = null;
    let finalFileName = null;
    let applied = false;
    if (verdict === FILE_VERDICT_VERIFIED && !duplicateCheck.duplicate && !duplicateCheck.blockedByCheckError) {
        reportPhase("saving");
        pointId = uid();
        finalFileName = buildStoredFileName({
            benchmark: parserOut.parsed.benchmark,
            delay: parserOut.parsed.delay,
            area: parserOut.parsed.area,
            sender: command.name,
            pointId,
        });
        await uploadPointFileToPrimaryBucket(finalFileName, circuitText, { signal });
        throwIfAborted(signal);
        const created = await createPointForCommand({
            command,
            id: pointId,
            benchmark: parserOut.parsed.benchmark,
            delay: parserOut.parsed.delay,
            area: parserOut.parsed.area,
            description: requestRow.description,
            fileName: finalFileName,
            status: FILE_VERDICT_VERIFIED,
            checkerVersion: checkerOut.checkerVersion || null,
            fileSize: fileRow.fileSize,
            batchSize: requestRow.totalCount,
        });
        if (!created.ok) {
            throw new Error(created.error || "Failed to save point.");
        }
        applied = true;
    }

    return {
        processState: FILE_PROCESS_STATE_PROCESSED,
        verdict,
        verdictReason,
        canApply,
        defaultChecked,
        checkerVersion: checkerOut.checkerVersion || null,
        parsedBenchmark: String(parserOut.parsed.benchmark || ""),
        parsedDelay: Number(parserOut.parsed.delay),
        parsedArea: Number(parserOut.parsed.area),
        finalFileName,
        pointId,
        applied,
    };
}

export async function applyUploadQueueFileRow({
    command,
    requestRow,
    fileRow,
    circuitText,
}) {
    if (!fileRow.canApply || fileRow.applied) {
        return { ok: false, error: "File cannot be applied." };
    }
    if (!fileRow.parsedBenchmark || !Number.isFinite(fileRow.parsedDelay) || !Number.isFinite(fileRow.parsedArea)) {
        return { ok: false, error: "File has no parsed benchmark metrics." };
    }

    const pointId = uid();
    const finalFileName = buildStoredFileName({
        benchmark: fileRow.parsedBenchmark,
        delay: fileRow.parsedDelay,
        area: fileRow.parsedArea,
        sender: command.name,
        pointId,
    });
    await uploadPointFileToPrimaryBucket(finalFileName, circuitText);

    const created = await createPointForCommand({
        command,
        id: pointId,
        benchmark: fileRow.parsedBenchmark,
        delay: fileRow.parsedDelay,
        area: fileRow.parsedArea,
        description: requestRow.description,
        fileName: finalFileName,
        status: fileRow.verdict === FILE_VERDICT_DUPLICATE ? FILE_VERDICT_NON_VERIFIED : fileRow.verdict,
        checkerVersion: fileRow.checkerVersion || null,
        fileSize: fileRow.fileSize,
        batchSize: requestRow.totalCount,
    });
    if (!created.ok) {
        return { ok: false, error: created.error || "Failed to save point." };
    }

    return {
        ok: true,
        pointId,
        finalFileName,
        point: created.point,
    };
}

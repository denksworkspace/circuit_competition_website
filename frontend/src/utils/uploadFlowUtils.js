// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
export function mapVerifyProgressLabel(statusRaw, tleSeconds) {
    const status = String(statusRaw || "").trim().toLowerCase();
    if (status === "queued") return "Testing: queued";
    if (status === "auth") return "Testing: auth";
    if (status === "download_point") return "Testing: download point";
    if (status === "read_truth") return "Testing: read_truth";
    if (status === "cec") return `Testing: cec -T ${tleSeconds} -n`;
    if (status === "truth_to_hex") return "Testing: truth -> hex";
    if (status === "bench_to_hex") return "Testing: bench -> hex";
    if (status === "hex_compare") return "Testing: hex compare";
    if (status === "done") return "Testing: done";
    if (status === "error") return "Testing: failed";
    return "Testing...";
}

export function buildManualRowsFromAutoRows(autoRows, suffix = "") {
    return (Array.isArray(autoRows) ? autoRows : []).map((row, index) => ({
        key: `stop:${row.fileName || row?.candidate?.file?.name || "file"}:${index}:${suffix}`,
        checked: true,
        bench: row?.candidate?.parsed?.benchmark,
        delay: row?.candidate?.parsed?.delay,
        area: row?.candidate?.parsed?.area,
        verdict: row?.candidate?.verificationResult?.status || "verified",
        verdictReason: "Processed before stop request.",
        reason: `file=${row.fileName || row?.candidate?.file?.name || "unknown"}`,
        candidate: row.candidate,
    }));
}

export function parseTruthFileName(fileNameRaw) {
    const fileName = String(fileNameRaw || "").trim();
    const match = fileName.match(/^bench(2\d\d)\.truth$/i);
    if (!match) {
        return {
            ok: false,
            error: "Invalid truth file name. Expected: bench{200..299}.truth",
        };
    }
    return {
        ok: true,
        benchmark: String(Number(match[1])),
        fileName,
    };
}

export function normalizeCircuitTextForHash(textRaw) {
    return String(textRaw || "")
        .replace(/^\uFEFF/, "")
        .replace(/\r\n?/g, "\n")
        .trimEnd();
}

export function isRenderNonVerdictReason(reasonRaw) {
    const reason = String(reasonRaw || "").toLowerCase();
    if (!reason) return true;
    return (
        reason.includes("timed out") ||
        reason.includes("timeout") ||
        reason.includes("failed to compute metrics") ||
        reason.includes("body too large") ||
        reason.includes("failed to fetch") ||
        reason.includes("network")
    );
}

export function normalizeParserResultRow(row, fallbackParsed) {
    if (!row) {
        return {
            kind: "non-verdict",
            reason: "Render parser response is missing.",
            parsed: fallbackParsed,
            changed: false,
        };
    }
    const expectedDelay = Number(row?.expected?.delay);
    const expectedArea = Number(row?.expected?.area);
    const actualDelay = Number(row?.actual?.delay);
    const actualArea = Number(row?.actual?.area);
    const hasExpected = Number.isFinite(expectedDelay) && Number.isFinite(expectedArea);
    const hasActual = Number.isFinite(actualDelay) && Number.isFinite(actualArea);
    const isParetoBetterOrEqual = hasExpected && hasActual && actualDelay <= expectedDelay && actualArea <= expectedArea;

    if (row.ok && isParetoBetterOrEqual && (Boolean(row?.adjusted) || actualDelay !== expectedDelay || actualArea !== expectedArea)) {
        return {
            kind: "pass-adjusted",
            reason: row.reason || `Parser adjusted metrics to delay=${actualDelay}, area=${actualArea}.`,
            parsed: {
                ...fallbackParsed,
                delay: actualDelay,
                area: actualArea,
            },
            changed: actualDelay !== fallbackParsed.delay || actualArea !== fallbackParsed.area,
        };
    }

    if (row.ok) {
        return {
            kind: "pass",
            reason: "Parser matched filename metrics.",
            parsed: fallbackParsed,
            changed: false,
        };
    }

    if (hasExpected && hasActual && actualDelay <= expectedDelay && actualArea <= expectedArea) {
        return {
            kind: "pass-adjusted",
            reason: `Parser adjusted metrics to delay=${actualDelay}, area=${actualArea}.`,
            parsed: {
                ...fallbackParsed,
                delay: actualDelay,
                area: actualArea,
            },
            changed: actualDelay !== fallbackParsed.delay || actualArea !== fallbackParsed.area,
        };
    }

    if (hasExpected && hasActual) {
        return {
            kind: "failed",
            reason: row.reason || "Metric mismatch.",
            parsed: fallbackParsed,
            changed: false,
        };
    }

    if (isRenderNonVerdictReason(row.reason)) {
        return {
            kind: "non-verdict",
            reason: row.reason || "Parser did not return verdict.",
            parsed: fallbackParsed,
            changed: false,
        };
    }

    return {
        kind: "failed",
        reason: row.reason || "Parser validation failed.",
        parsed: fallbackParsed,
        changed: false,
    };
}

export function toTruthLogText(rows) {
    return rows
        .map((row) => `file=${row.fileName}; success=${row.success ? "true" : "false"}; reason=${row.reason}`)
        .join("\n");
}

export function appendTextLog(setter, line) {
    setter((prev) => (prev ? `${prev}\n${line}` : line));
}

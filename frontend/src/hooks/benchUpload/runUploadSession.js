import { parseBenchFileName } from "../../utils/pointUtils.js";
import { buildManualRowsFromAutoRows, normalizeParserResultRow } from "../../utils/uploadFlowUtils.js";
import { findIdenticalPointDuplicate, readCircuitFileAsText, sha256Hex } from "../../utils/pointUploadHelpers.js";
import { checkPointDuplicate, validateUploadCircuits, verifyPointCircuit } from "../../services/apiClient.js";

export async function runUploadSession({
    benchFiles,
    selectedParser,
    checkerSelection,
    checkerTimeoutSeconds,
    parserTimeoutSeconds,
    enabledCheckers,
    authKeyDraft,
    currentCommandName,
    description,
    controller,
    uploadStopRequestedRef,
    startUploadCountdown,
    stopUploadCountdown,
    setUploadProgress,
    setUploadError,
    setUploadLogText,
    setUploadVerdictNote,
    setManualApplyRows,
    setIsManualApplyOpen,
    setPoints,
    setLastAddedId,
    setBenchmarkFilter,
    setDescriptionDraft,
    clearFileInput,
    createPointFromUploadedFile,
}) {
    const autoRows = [];
    const manualRowsDraft = [];
    const logRows = [];
    let singleFileManualVerdict = null;
    const isAbortError = (error) => error?.name === "AbortError";

    try {
        const parserEnabled = selectedParser === "ABC";
        const checkerEnabled = enabledCheckers.has(checkerSelection);
        const fileStepOrder = [];
        if (parserEnabled) fileStepOrder.push("parser");
        if (checkerEnabled) fileStepOrder.push("checker");
        const resolveTransitionTarget = (currentStep) => {
            const idx = fileStepOrder.indexOf(currentStep);
            if (idx >= 0 && idx < fileStepOrder.length - 1) return "next-step";
            return "next-circuit";
        };
        const needsCircuitText = parserEnabled || checkerEnabled;
        const preparedFiles = [];
        for (const file of benchFiles) {
            const parsed = parseBenchFileName(file.name);
            if (!parsed.ok) {
                throw new Error(parsed.error);
            }
            const circuitText = needsCircuitText ? await readCircuitFileAsText(file) : "";
            preparedFiles.push({ file, parsed, circuitText });
        }

        const batchDuplicateMap = new Map();

        for (const item of preparedFiles) {
            if (uploadStopRequestedRef.current) break;
            const normalizedInputFileName = item.parsed.normalizedFileName || item.file.name;
            let parserState = {
                kind: "skipped",
                reason: "Parser is disabled.",
                parsed: item.parsed,
                changed: false,
            };
            if (parserEnabled) {
                setUploadProgress((prev) =>
                    prev
                        ? {
                            ...prev,
                            phase: "parser",
                            currentFileName: normalizedInputFileName,
                            secondsRemaining: parserTimeoutSeconds,
                            transitionTarget: resolveTransitionTarget("parser"),
                        }
                        : prev
                );
                startUploadCountdown(parserTimeoutSeconds);
                try {
                    const parserResult = await validateUploadCircuits({
                        authKey: authKeyDraft,
                        files: [
                            {
                                fileName: normalizedInputFileName,
                                circuitText: item.circuitText,
                            },
                        ],
                        timeoutSeconds: parserTimeoutSeconds,
                        signal: controller.signal,
                    });
                    const parserRows = Array.isArray(parserResult?.files) ? parserResult.files : [];
                    const parserRow = parserRows[0] || { ok: true, fileName: normalizedInputFileName };
                    parserState = normalizeParserResultRow(parserRow, item.parsed);
                } catch (validationError) {
                    if (isAbortError(validationError)) throw validationError;
                    const detailRows = Array.isArray(validationError?.details) ? validationError.details : [];
                    const parserRow = detailRows[0] || {
                        ok: false,
                        fileName: normalizedInputFileName,
                        reason: validationError?.message || "Render parser request failed.",
                    };
                    parserState = normalizeParserResultRow(parserRow, item.parsed);
                } finally {
                    stopUploadCountdown();
                }
            }

            let checkerVerdict = null;
            let checkerVersion = null;
            let checkerErrorReason = "";
            if (checkerEnabled) {
                checkerVersion = checkerSelection;
                setUploadProgress((prev) =>
                    prev
                        ? {
                            ...prev,
                            phase: "checker",
                            currentFileName: normalizedInputFileName,
                            secondsRemaining: checkerTimeoutSeconds,
                            transitionTarget: resolveTransitionTarget("checker"),
                        }
                        : prev
                );
                startUploadCountdown(checkerTimeoutSeconds);
                try {
                    const verified = await verifyPointCircuit({
                        authKey: authKeyDraft,
                        benchmark: parserState.parsed.benchmark,
                        circuitText: item.circuitText,
                        checkerVersion: checkerSelection,
                        applyStatus: false,
                        timeoutSeconds: checkerTimeoutSeconds,
                        signal: controller.signal,
                    });
                    checkerVerdict = verified?.status === "verified";
                } catch (error) {
                    if (isAbortError(error)) throw error;
                    checkerVerdict = null;
                    checkerErrorReason = String(error?.message || "checker request failed");
                } finally {
                    stopUploadCountdown();
                }
            }

            let finalStatus = "non-verified";
            if (parserState.kind === "failed" || checkerVerdict === false) {
                finalStatus = "failed";
            } else if (
                checkerEnabled &&
                checkerVerdict === true &&
                (!parserEnabled || parserState.kind === "pass" || parserState.kind === "pass-adjusted")
            ) {
                finalStatus = "verified";
            }

            const candidate = {
                file: item.file,
                parsed: parserState.parsed,
                description,
                verificationResult: {
                    status: finalStatus,
                    checkerVersion,
                },
                parserChanged: parserState.changed,
            };
            const candidateHash = await sha256Hex(item.circuitText);
            const duplicateKey = candidateHash
                ? `${parserState.parsed.benchmark}|${parserState.parsed.delay}|${parserState.parsed.area}|${candidateHash}`
                : null;
            const duplicateCheck = await findIdenticalPointDuplicate({
                benchmark: parserState.parsed.benchmark,
                delay: parserState.parsed.delay,
                area: parserState.parsed.area,
                circuitText: item.circuitText,
                signal: controller.signal,
                checkDuplicate: ({ benchmark, delay, area, circuitText, signal }) =>
                    checkPointDuplicate({
                        authKey: authKeyDraft,
                        benchmark,
                        delay,
                        area,
                        circuitText,
                        signal,
                    }),
            });
            let duplicateInfo = duplicateCheck?.duplicateInfo || null;
            const duplicateCheckError = String(duplicateCheck?.errorReason || "");
            if (!duplicateInfo && duplicateKey && batchDuplicateMap.has(duplicateKey)) {
                const firstSeen = batchDuplicateMap.get(duplicateKey);
                duplicateInfo = {
                    id: "",
                    fileName: String(firstSeen?.fileName || ""),
                    sender: String(currentCommandName || ""),
                };
            }
            if (duplicateKey && !batchDuplicateMap.has(duplicateKey)) {
                batchDuplicateMap.set(duplicateKey, {
                    fileName: normalizedInputFileName,
                });
            }

            setUploadProgress((prev) => {
                if (!prev) return prev;
                const verifiedDelta = finalStatus === "verified" ? 1 : 0;
                return {
                    ...prev,
                    done: Math.min(prev.total, prev.done + 1),
                    verified: Math.min(prev.total, Number(prev.verified || 0) + verifiedDelta),
                };
            });

            if (finalStatus !== "verified" || duplicateInfo || duplicateCheck?.blockedByCheckError) {
                const verdictLabel = duplicateCheck?.blockedByCheckError
                    ? "blocked"
                    : (duplicateInfo ? "duplicate" : finalStatus);
                let verdictReason = "";
                if (duplicateCheck?.blockedByCheckError) {
                    verdictReason = duplicateCheckError || "Failed to verify duplicates against existing points.";
                } else if (finalStatus === "failed") {
                    if (checkerErrorReason) {
                        verdictReason = checkerErrorReason;
                    } else if (parserState.kind === "failed" && parserState.reason) {
                        verdictReason = String(parserState.reason);
                    } else if (checkerVerdict === false) {
                        verdictReason = "checker: not equivalent";
                    }
                    if (!verdictReason) {
                        verdictReason = "checker/parser failed with unknown reason";
                    }
                } else if (finalStatus === "non-verified") {
                    if (checkerErrorReason) {
                        verdictReason = checkerErrorReason;
                    } else if (parserState.kind === "non-verdict" && parserState.reason) {
                        verdictReason = String(parserState.reason);
                    }
                    if (!verdictReason) {
                        verdictReason = "verification skipped or checker unavailable";
                    }
                }
                manualRowsDraft.push({
                    key: `${item.file.name}:${item.file.size}:${manualRowsDraft.length}`,
                    checked: !(duplicateInfo || duplicateCheck?.blockedByCheckError),
                    bench: parserState.parsed.benchmark,
                    delay: parserState.parsed.delay,
                    area: parserState.parsed.area,
                    verdict: finalStatus,
                    verdictReason,
                    reason: duplicateInfo
                        ? `Identical file hash for same delay+area already exists: ${duplicateInfo.fileName || duplicateInfo.id || "existing point"}.`
                        : "",
                    candidate,
                });
                const manualReasonParts = [];
                if (verdictReason) manualReasonParts.push(verdictReason);
                if (duplicateInfo) manualReasonParts.push("identical file hash and same bench+delay+area");
                const manualReason = manualReasonParts.join("; ");
                logRows.push({
                    fileName: normalizedInputFileName,
                    success: false,
                    reason: manualReason
                        ? `verdict=${verdictLabel}; ${manualReason}`
                        : `verdict=${verdictLabel}; unknown reason`,
                });
                if (benchFiles.length === 1) {
                    const details = verdictReason || (duplicateInfo ? "identical file hash and same bench+delay+area" : "");
                    singleFileManualVerdict = details
                        ? `Upload verdict: ${verdictLabel} (${details})`
                        : `Upload verdict: ${verdictLabel}`;
                }
                continue;
            }

            autoRows.push({
                fileName: normalizedInputFileName,
                candidate,
            });
        }

        const savedPoints = [];
        const pendingAutoRows = [];
        for (let rowIndex = 0; rowIndex < autoRows.length; rowIndex += 1) {
            if (uploadStopRequestedRef.current) {
                pendingAutoRows.push(...autoRows.slice(rowIndex));
                break;
            }
            const row = autoRows[rowIndex];
            const fileName = row.fileName || row?.candidate?.file?.name || "unknown";
            setUploadProgress((prev) =>
                prev
                    ? {
                        ...prev,
                        phase: "saving",
                        currentFileName: fileName,
                        secondsRemaining: null,
                    }
                    : prev
            );
            try {
                const saved = await createPointFromUploadedFile(
                    row.candidate.file,
                    row.candidate.parsed,
                    description,
                    row.candidate.verificationResult,
                    { signal: controller.signal }
                );
                savedPoints.push(saved);
                logRows.push({
                    fileName,
                    success: true,
                    reason: "verdict=verified; uploaded successfully.",
                });
            } catch (err) {
                if (isAbortError(err)) throw err;
                logRows.push({
                    fileName,
                    success: false,
                    reason: `verdict=failed; ${err?.message || "Failed to upload point."}`,
                });
            }
        }

        if (uploadStopRequestedRef.current) {
            const stopRows = buildManualRowsFromAutoRows(pendingAutoRows, "pending");
            const combinedStopRows = [...manualRowsDraft, ...stopRows];
            if (combinedStopRows.length > 0) {
                setManualApplyRows(combinedStopRows);
                setIsManualApplyOpen(true);
                setUploadError(
                    `Upload stopped. ${stopRows.length} verified file(s) are ready to upload after confirmation.`
                );
            } else {
                setUploadError("Upload stopped.");
            }
        } else if (manualRowsDraft.length > 0) {
            setManualApplyRows(manualRowsDraft);
            setIsManualApplyOpen(true);
        }
        if (benchFiles.length === 1 && singleFileManualVerdict) {
            setUploadVerdictNote(singleFileManualVerdict);
        }

        if (savedPoints.length > 0) {
            setPoints((prev) => [...savedPoints.reverse(), ...prev]);
            const latestSaved = savedPoints[savedPoints.length - 1];
            setLastAddedId(latestSaved.id);
            setBenchmarkFilter(String(latestSaved.benchmark));
            if (benchFiles.length === 1) {
                setUploadVerdictNote("Upload verdict: verified");
            }
        }

        if (logRows.length > 0) {
            const lines = logRows.map(
                (row) => `file=${row.fileName}; success=${row.success ? "true" : "false"}; reason=${row.reason}`
            );
            setUploadLogText(lines.join("\n"));
        }

        const failedCount = logRows.filter((row) => !row.success).length;
        if (failedCount > 0) {
            if (benchFiles.length >= 2) {
                setUploadError(
                    `Uploaded ${logRows.length - failedCount}/${logRows.length} files. Download log for details.`
                );
            } else {
                const firstFail = logRows.find((row) => !row.success);
                setUploadError(firstFail?.reason || "Failed to upload point.");
            }
        } else {
            setUploadError(" ");
        }

        setDescriptionDraft("");
        clearFileInput();
    } catch (err) {
        if (isAbortError(err) || uploadStopRequestedRef.current) {
            const pendingAutoRows = autoRows.slice(0);
            const stopRows = buildManualRowsFromAutoRows(pendingAutoRows, "abort");
            const combinedRows = [...manualRowsDraft, ...stopRows];
            if (combinedRows.length > 0) {
                setManualApplyRows(combinedRows);
                setIsManualApplyOpen(true);
            }
            setUploadError("Upload stopped.");
            if (logRows.length > 0) {
                const lines = logRows.map(
                    (row) => `file=${row.fileName}; success=${row.success ? "true" : "false"}; reason=${row.reason}`
                );
                setUploadLogText(lines.join("\n"));
            }
        } else {
            setUploadError(err?.message || "Failed to upload point.");
        }
    }
}

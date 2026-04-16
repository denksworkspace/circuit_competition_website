import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MAX_DESCRIPTION_LEN } from "../constants/appConstants.js";
import { parsePosIntCapped } from "../utils/numberUtils.js";
import { getBenchFilesError } from "../utils/benchUploadValidation.js";
import {
    applyPointsUploadRequestFiles,
    closePointsUploadRequest,
    createPointsUploadRequest,
    fetchActivePointsUploadRequest,
    fetchVerifyPointProgress,
    fetchPointsUploadRequestStatus,
    fetchPoints,
    runPointsUploadRequest,
    stopPointsUploadRequest,
} from "../services/apiClient.js";
import { uid } from "../utils/pointUtils.js";

const RUNNABLE_REQUEST_STATUSES = new Set(["queued", "processing"]);
const TERMINAL_REQUEST_STATUSES = new Set(["completed", "closed", "interrupted", "failed"]);
const FREEZED_REQUEST_STATUS = "freezed";
const WAITING_MANUAL_REQUEST_STATUS = "waiting_manual_verdict";

function isRunnableRequestStatus(statusRaw) {
    return RUNNABLE_REQUEST_STATUSES.has(String(statusRaw || "").trim().toLowerCase());
}

function isExternallyManagedQueueStatus(statusRaw) {
    const status = String(statusRaw || "").trim().toLowerCase();
    return status === FREEZED_REQUEST_STATUS || status === WAITING_MANUAL_REQUEST_STATUS;
}

function hasManualVerdictPending(row) {
    return !row?.applied && Boolean(row?.canApply) && Boolean(row?.manualReviewRequired);
}

function isManualFlowEnabledForRequest(request) {
    return request?.autoManualWindow !== true;
}

function isTerminalRequestStatus(statusRaw) {
    return TERMINAL_REQUEST_STATUSES.has(String(statusRaw || "").trim().toLowerCase());
}

function isBlockingRequestStatus(statusRaw) {
    return isRunnableRequestStatus(statusRaw) || isExternallyManagedQueueStatus(statusRaw);
}

function mapPhase(phaseRaw, statusRaw) {
    const phase = String(phaseRaw || "").trim().toLowerCase();
    const status = String(statusRaw || "").trim().toLowerCase();
    if (isTerminalRequestStatus(status)) return "finished";
    if (phase === "parser") return "parser";
    if (phase === "checker") return "checker";
    if (phase === "saving") return "saving";
    if (phase === "download") return "preparing";
    if (status === WAITING_MANUAL_REQUEST_STATUS) return "waiting-manual";
    if (status === "queued") return "preparing";
    if (status === "processing") return "processing";
    if (status === FREEZED_REQUEST_STATUS) return "paused";
    return "preparing";
}

function buildUploadLogText(files, { manualFlowEnabled = true } = {}) {
    if (!Array.isArray(files) || files.length === 0) return "";
    const rows = files
        .filter((row) => ["processed", "non-processed"].includes(String(row?.processState || "").toLowerCase()))
        .map((row) => {
            const success = Boolean(row?.applied);
            const verdict = manualFlowEnabled && hasManualVerdictPending(row)
                ? "waiting manual verdict"
                : String(row?.verdict || "pending");
            const reason = String(row?.verdictReason || "").trim();
            const paretoState = String(row?.paretoState || "").trim().toLowerCase();
            const replacedCoords = Array.isArray(row?.replacedParetoCoords) ? row.replacedParetoCoords : [];
            const replacedLabel = replacedCoords
                .map((item) => `(${Number(item?.delay)}, ${Number(item?.area)})`)
                .join("; ");
            return `file=${String(row?.originalFileName || "unknown")}; success=${success ? "true" : "false"}; verdict=${verdict}; pareto=${paretoState || "-"}; replaced=${replacedLabel || "-"}; reason=${reason || "-"}`;
        });
    return rows.join("\n");
}

function buildManualRows(files, { manualFlowEnabled = true } = {}) {
    if (!manualFlowEnabled || !Array.isArray(files)) return [];
    return files
        .filter((row) => hasManualVerdictPending(row))
        .map((row) => {
            const verdict = String(row?.verdict || "pending");
            return {
                key: String(row.id || ""),
                fileId: String(row.id || ""),
                checked: Boolean(row?.defaultChecked) && verdict !== "failed",
                disabled: !row?.canApply,
                bench: row?.parsedBenchmark || "-",
                delay: Number.isFinite(Number(row?.parsedDelay)) ? Number(row.parsedDelay) : "-",
                area: Number.isFinite(Number(row?.parsedArea)) ? Number(row.parsedArea) : "-",
                statusLabel: "waiting manual verdict",
                verdict,
                verdictReason: String(row?.verdictReason || ""),
                reason: `file=${String(row?.originalFileName || "unknown")}`,
            };
        });
}

function getUploadDisabledReason({
    isUploading,
    uploadPhase,
    manualApplyRowsLength,
    blockingRequestStatus,
    waitManualRequestStatus,
    benchFiles,
    selectedChecker,
    selectedParser,
    normalizeCheckerForActor,
    enabledCheckers,
    checkerTleSecondsDraft,
    verifyTimeoutQuotaSeconds,
    parserTleSecondsDraft,
    metricsTimeoutQuotaSeconds,
    maxMultiFileBatchCount,
    maxSingleUploadBytes,
    remainingUploadBytes,
    formatGb,
    descriptionDraft,
}) {
    const normalizedPhase = String(uploadPhase || "").trim().toLowerCase();
    if (isUploading && normalizedPhase !== "finished") return "Upload is already in progress.";
    if (blockingRequestStatus === FREEZED_REQUEST_STATUS) {
        return "Upload queue is paused by maintenance mode.";
    }
    if (isRunnableRequestStatus(blockingRequestStatus)) {
        return "An upload request is already in progress.";
    }
    if (manualApplyRowsLength > 0 || blockingRequestStatus === waitManualRequestStatus) {
        return "Resolve manual verdict for the previous upload first.";
    }
    if (benchFiles.length === 0) return "No files selected.";
    if (selectedChecker === "select" || selectedParser === "select") {
        return "Please configure checker and parser in settings.";
    }
    const checkerSelection = normalizeCheckerForActor(selectedChecker);
    const checkerTleParsed = parsePosIntCapped(checkerTleSecondsDraft, verifyTimeoutQuotaSeconds);
    if (enabledCheckers.has(checkerSelection) && checkerTleParsed === null) {
        return `Checker TLE must be an integer from 1 to ${verifyTimeoutQuotaSeconds} seconds.`;
    }
    const parserTleParsed = parsePosIntCapped(parserTleSecondsDraft, metricsTimeoutQuotaSeconds);
    if (selectedParser === "ABC" && parserTleParsed === null) {
        return `Parser TLE must be an integer from 1 to ${metricsTimeoutQuotaSeconds} seconds.`;
    }
    const filesError = getBenchFilesError({
        files: benchFiles,
        maxMultiFileBatchCount,
        maxSingleUploadBytes,
        remainingUploadBytes,
        formatGb,
    });
    if (filesError) return filesError;
    const description = descriptionDraft.trim() || "circuit";
    if (description.length > MAX_DESCRIPTION_LEN) {
        return `Description is too long (max ${MAX_DESCRIPTION_LEN}).`;
    }
    return "";
}

function buildInitialQueueRows(files) {
    return (Array.isArray(files) ? files : []).map((file, index) => ({
        key: `queue:${index}:${String(file?.name || "file")}`,
        fileName: String(file?.name || "unknown"),
        statusLabel: "queue pending",
        tone: "queued",
        reason: "",
    }));
}

function buildLiveRowStatus(row) {
    const processState = String(row?.processState || "pending").trim().toLowerCase();
    if (processState === "processing") {
        return { statusLabel: "processing", tone: "processing" };
    }
    if (processState === "pending") {
        return { statusLabel: "queued", tone: "queued" };
    }
    if (processState === "non-processed") {
        return { statusLabel: "not processed", tone: "muted" };
    }
    const verdict = String(row?.verdict || "processed").trim().toLowerCase();
    if (verdict === "verified") {
        return { statusLabel: "verified", tone: "success" };
    }
    if (verdict === "failed") {
        return { statusLabel: "failed", tone: "error" };
    }
    if (verdict === "non-verified") {
        return { statusLabel: "non-verified", tone: "info" };
    }
    if (verdict === "duplicate") {
        return { statusLabel: "duplicate", tone: "info" };
    }
    if (verdict === "warning") {
        return { statusLabel: "warning", tone: "info" };
    }
    if (verdict === "blocked") {
        return { statusLabel: "blocked", tone: "error" };
    }
    return { statusLabel: verdict || "processed", tone: "success" };
}

function buildLiveRows(files, { showParetoLabels = false } = {}) {
    if (!Array.isArray(files)) return [];
    return files.map((row) => {
        const status = buildLiveRowStatus(row);
        let paretoLabel = "";
        let paretoTone = "info";
        const paretoState = String(row?.paretoState || "").trim().toLowerCase();
        if (showParetoLabels && paretoState === "new-front") {
            paretoLabel = "new pareto front";
            paretoTone = "info";
        }
        const orderIndex = Number(row?.orderIndex);
        const fileName = String(row?.originalFileName || "unknown");
        return {
            key: Number.isFinite(orderIndex)
                ? `queue:${orderIndex}:${fileName}`
                : `queue:${fileName}`,
            fileName,
            statusLabel: status.statusLabel,
            tone: status.tone,
            paretoLabel,
            paretoTone,
            reason: String(row?.verdictReason || "").trim(),
        };
    });
}

function updateLocalQueueRow(rows, rowIndex, nextData) {
    return rows.map((row, index) => (index === rowIndex ? { ...row, ...nextData } : row));
}

const ACTIVE_QUEUE_STATUS_POLL_MS = 2000;
const IDLE_QUEUE_CHECK_MS = 60 * 60 * 1000;

async function buildQueueUploadErrorMessage(response, fileName) {
    const fallback = `Failed to upload ${fileName} to queue storage (HTTP ${Number(response?.status || 0)}).`;
    if (!response || typeof response.text !== "function") return fallback;
    try {
        const raw = String(await response.text() || "");
        if (!raw.trim()) return fallback;
        const codeMatch = raw.match(/<Code>\s*([^<]+)\s*<\/Code>/i);
        const messageMatch = raw.match(/<Message>\s*([^<]+)\s*<\/Message>/i);
        const code = String(codeMatch?.[1] || "").trim();
        const message = String(messageMatch?.[1] || "").trim();
        if (code && message) {
            return `Failed to upload ${fileName} to queue storage: ${code} - ${message}.`;
        }
        if (message) {
            return `Failed to upload ${fileName} to queue storage: ${message}.`;
        }
        return `${fallback} ${raw.slice(0, 180)}`;
    } catch {
        return fallback;
    }
}

export function useBenchUploadFlow({
    authKeyDraft,
    currentCommand,
    setPoints,
    setLastAddedId,
    onPointsPersisted,
    maxSingleUploadBytes,
    remainingUploadBytes,
    maxMultiFileBatchCount,
    verifyTimeoutQuotaSeconds,
    metricsTimeoutQuotaSeconds,
    formatGb,
    normalizeCheckerForActor,
    enabledCheckers,
}) {
    const [benchFiles, setBenchFiles] = useState(() => []);
    const [descriptionDraft, setDescriptionDraft] = useState("");
    const [selectedChecker, setSelectedChecker] = useState("ABC");
    const [uploadError, setUploadError] = useState(" ");
    const [isUploading, setIsUploading] = useState(false);
    const [isUploadStopping, setIsUploadStopping] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(null);
    const [uploadLiveRows, setUploadLiveRows] = useState(() => []);
    const [blockingRequestStatus, setBlockingRequestStatus] = useState("");
    const fileInputRef = useRef(null);
    const [uploadLogText, setUploadLogText] = useState("");
    const [uploadVerdictNote, setUploadVerdictNote] = useState("");
    const [selectedParser, setSelectedParser] = useState("ABC");
    const [checkerTleSecondsDraft, setCheckerTleSecondsDraft] = useState("60");
    const [parserTleSecondsDraft, setParserTleSecondsDraft] = useState("60");
    const [manualSynthesis, setManualSynthesis] = useState(false);
    const [autoManualWindow, setAutoManualWindow] = useState(true);
    const [isUploadSettingsOpen, setIsUploadSettingsOpen] = useState(false);
    const [manualApplyRows, setManualApplyRows] = useState(() => []);
    const [isManualApplyOpen, setIsManualApplyOpen] = useState(false);
    const [isManualApplying, setIsManualApplying] = useState(false);
    const [manualApplyProgress, setManualApplyProgress] = useState(null);

    const uploadAbortRef = useRef(null);
    const activeRequestIdRef = useRef("");
    const isPreRunUploadRef = useRef(false);
    const hiddenRequestIdRef = useRef("");
    const dismissedManualRequestIdRef = useRef("");
    const pollGenerationRef = useRef(0);
    const lastSnapshotRef = useRef({ request: null, files: [] });
    const pollTimerRef = useRef(null);
    const pollInFlightControllerRef = useRef(null);
    const pollLoopRef = useRef(null);
    const pollPausedExternallyRef = useRef(false);
    const isPageUnloadingRef = useRef(false);
    const queueUploadInFlightRef = useRef(false);

    useEffect(() => {
        if (typeof window === "undefined") return undefined;
        const markPageUnloading = () => {
            isPageUnloadingRef.current = true;
        };
        window.addEventListener("pagehide", markPageUnloading);
        window.addEventListener("beforeunload", markPageUnloading);
        return () => {
            window.removeEventListener("pagehide", markPageUnloading);
            window.removeEventListener("beforeunload", markPageUnloading);
        };
    }, []);

    useEffect(() => {
        return () => {
            if (uploadAbortRef.current && !isPageUnloadingRef.current) {
                uploadAbortRef.current.abort();
                uploadAbortRef.current = null;
            }
        };
    }, []);

    function clearFileInput() {
        setBenchFiles([]);
        if (fileInputRef.current) fileInputRef.current.value = "";
    }

    function onFileChange(e) {
        const files = Array.from(e.target.files || []);
        setBenchFiles(files);
        setUploadLogText("");
        setUploadVerdictNote("");

        if (files.length === 0) {
            setUploadError(" ");
            return;
        }
        const filesError = getBenchFilesError({
            files,
            maxMultiFileBatchCount,
            maxSingleUploadBytes,
            remainingUploadBytes,
            formatGb,
        });
        setUploadError(filesError || " ");
    }

    function normalizeDescriptionForSubmit() {
        const description = descriptionDraft.trim();
        if (!description) return "circuit";
        return description;
    }

    function parseCheckerTimeoutSeconds() {
        return parsePosIntCapped(checkerTleSecondsDraft, verifyTimeoutQuotaSeconds);
    }

    function parseParserTimeoutSeconds() {
        return parsePosIntCapped(parserTleSecondsDraft, metricsTimeoutQuotaSeconds);
    }

    function bumpPollGeneration() {
        pollGenerationRef.current += 1;
        return pollGenerationRef.current;
    }

    const wakePolling = useCallback(() => {
        pollPausedExternallyRef.current = false;
        if (pollTimerRef.current) {
            clearTimeout(pollTimerRef.current);
            pollTimerRef.current = null;
        }
        if (pollInFlightControllerRef.current) {
            pollInFlightControllerRef.current.abort();
            pollInFlightControllerRef.current = null;
        }
        if (typeof pollLoopRef.current === "function") {
            void pollLoopRef.current();
        }
    }, []);

    useEffect(() => {
        if (typeof window === "undefined" || typeof document === "undefined") return undefined;
        const wakeOnFocusOrOnline = () => {
            if (document.visibilityState && document.visibilityState !== "visible") return;
            wakePolling();
        };
        const wakeOnVisible = () => {
            if (document.visibilityState === "visible") {
                wakePolling();
            }
        };
        window.addEventListener("focus", wakeOnFocusOrOnline);
        window.addEventListener("online", wakeOnFocusOrOnline);
        document.addEventListener("visibilitychange", wakeOnVisible);
        return () => {
            window.removeEventListener("focus", wakeOnFocusOrOnline);
            window.removeEventListener("online", wakeOnFocusOrOnline);
            document.removeEventListener("visibilitychange", wakeOnVisible);
        };
    }, [wakePolling]);

    const refreshPointsAfterRequest = useCallback(async () => {
        try {
            const rows = await fetchPoints(authKeyDraft);
            setPoints(rows);
            if (rows.length > 0) {
                setLastAddedId(rows[0].id);
            }
        } catch {
            // ignore transient refresh failure; request state is already persisted on server
        }
    }, [authKeyDraft, setLastAddedId, setPoints]);

    const clearBlockingRequestControls = useCallback(() => {
        activeRequestIdRef.current = "";
        setBlockingRequestStatus("");
        setManualApplyRows([]);
        setManualApplyProgress(null);
        setIsManualApplyOpen(false);
    }, []);

    const updateStateFromSnapshot = useCallback((snapshot) => {
        const request = snapshot?.request || null;
        const files = Array.isArray(snapshot?.files) ? snapshot.files : [];
        lastSnapshotRef.current = { request, files };
        if (!request) {
            if (isPreRunUploadRef.current) {
                return;
            }
            pollPausedExternallyRef.current = false;
            dismissedManualRequestIdRef.current = "";
            hiddenRequestIdRef.current = "";
            setIsUploading(false);
            setIsUploadStopping(false);
            clearBlockingRequestControls();
            return;
        }
        const requestId = String(request.id || "");
        if (dismissedManualRequestIdRef.current && dismissedManualRequestIdRef.current !== requestId) {
            dismissedManualRequestIdRef.current = "";
        }

        const lowerStatus = String(request.status || "").toLowerCase();
        const doneCount = Number(request.doneCount || 0);
        const totalCount = Number(request.totalCount || 0);
        const isAllFilesProcessed = totalCount > 0 && doneCount >= totalCount;
        const manualFlowEnabled = isManualFlowEnabledForRequest(request);
        const runnable = isRunnableRequestStatus(lowerStatus);
        const terminal = isTerminalRequestStatus(lowerStatus);
        const externallyManaged = isExternallyManagedQueueStatus(lowerStatus);
        const hiddenRequestId = String(hiddenRequestIdRef.current || "");
        const isHiddenRequest = hiddenRequestId && hiddenRequestId === requestId;
        const rawManualRows = runnable ? [] : buildManualRows(files, { manualFlowEnabled });
        const manualRows = isHiddenRequest ? [] : rawManualRows;
        const hasPendingManualVerdict = manualRows.length > 0;
        const shouldKeepMonitor = runnable || rawManualRows.length > 0 || externallyManaged || terminal;
        const nextPhase = hasPendingManualVerdict && !runnable
            ? "waiting-manual"
            : mapPhase(request.currentPhase, request.status);

        if (queueUploadInFlightRef.current && lowerStatus === "queued") {
            activeRequestIdRef.current = requestId;
            setBlockingRequestStatus(lowerStatus);
            setIsUploading(true);
            return;
        }

        if (shouldKeepMonitor) {
            activeRequestIdRef.current = runnable || externallyManaged ? requestId : "";
            setBlockingRequestStatus(runnable || externallyManaged ? lowerStatus : "");
            setUploadProgress({
                done: doneCount,
                total: totalCount,
                verified: Number(request.verifiedCount || 0),
                paretoFront: Number(request.paretoFrontCount || 0),
                phase: nextPhase,
                requestStatus: lowerStatus,
                currentFileName: String(request.currentFileName || ""),
                secondsRemaining: null,
                transitionTarget: "next-circuit",
            });
            setUploadLiveRows(buildLiveRows(files, { showParetoLabels: isAllFilesProcessed }));
        } else {
            clearBlockingRequestControls();
        }

        setIsUploading(runnable);
        if (!runnable) {
            setIsUploadStopping(false);
        }
        setUploadLogText(buildUploadLogText(files, { manualFlowEnabled }));
        setManualApplyRows(manualRows);
        if (isHiddenRequest) {
            setIsManualApplyOpen(false);
            if (!runnable && rawManualRows.length < 1) {
                hiddenRequestIdRef.current = "";
            }
        } else if (!hasPendingManualVerdict || !manualFlowEnabled) {
            setIsManualApplyOpen(false);
        }

        if (lowerStatus === "interrupted") {
            setUploadError(String(request.error || "Upload stopped."));
        } else if (lowerStatus === "failed") {
            setUploadError(String(request.error || "Upload request failed."));
        } else {
            setUploadError(" ");
        }
    }, [clearBlockingRequestControls]);

    async function requestStopUpload() {
        if (!isUploading || !activeRequestIdRef.current) return;
        setIsUploadStopping(true);
        setUploadError("Stopping upload...");
        try {
            await stopPointsUploadRequest({
                authKey: authKeyDraft,
                requestId: activeRequestIdRef.current,
            });
        } catch (error) {
            setUploadError(error?.message || "Failed to stop upload request.");
            setIsUploadStopping(false);
        }
    }

    async function addPointFromFile(e) {
        e.preventDefault();
        if (manualApplyRows.length > 0 && activeRequestIdRef.current) {
            setUploadError("Click Apply manual verdict to finish the previous upload.");
            return;
        }
        if (selectedChecker === "select" || selectedParser === "select") {
            setUploadError("Please select checker and parser settings.");
            setIsUploadSettingsOpen(true);
            return;
        }
        if (benchFiles.length === 0) return;
        if (benchFiles.length > maxMultiFileBatchCount) {
            setUploadError(`Too many files selected. Maximum is ${maxMultiFileBatchCount}.`);
            return;
        }
        const checkerTimeoutSeconds = parseCheckerTimeoutSeconds();
        const parserTimeoutSeconds = parseParserTimeoutSeconds();
        const checkerSelection = normalizeCheckerForActor(selectedChecker);
        if (enabledCheckers.has(checkerSelection) && checkerTimeoutSeconds === null) {
            setUploadError(`Checker TLE must be an integer from 1 to ${verifyTimeoutQuotaSeconds} seconds.`);
            return;
        }
        if (selectedParser === "ABC" && parserTimeoutSeconds === null) {
            setUploadError(`Parser TLE must be an integer from 1 to ${metricsTimeoutQuotaSeconds} seconds.`);
            return;
        }
        const description = normalizeDescriptionForSubmit();
        if (description.length > MAX_DESCRIPTION_LEN) {
            setUploadError(`Description is too long (max ${MAX_DESCRIPTION_LEN}).`);
            return;
        }

        setIsUploading(true);
        setIsUploadStopping(false);
        isPreRunUploadRef.current = true;
        hiddenRequestIdRef.current = "";
        dismissedManualRequestIdRef.current = "";
        bumpPollGeneration();
        setBlockingRequestStatus("queued");
        setUploadProgress({
            done: 0,
            total: benchFiles.length,
            verified: 0,
            paretoFront: 0,
            phase: "uploading",
            requestStatus: "queued",
            currentFileName: "",
            queueUploaded: 0,
            queueTotal: benchFiles.length,
            secondsRemaining: null,
            transitionTarget: "next-circuit",
        });
        setUploadLiveRows(buildInitialQueueRows(benchFiles));
        setUploadLogText("");
        setUploadVerdictNote("");
        setManualApplyRows([]);
        setIsManualApplyOpen(false);

        const controller = new AbortController();
        uploadAbortRef.current = controller;
        try {
            const created = await createPointsUploadRequest({
                authKey: authKeyDraft,
                files: benchFiles.map((file) => ({
                    originalFileName: file.name,
                    fileSize: file.size,
                })),
                description,
                selectedParser,
                selectedChecker: checkerSelection,
                parserTimeoutSeconds,
                checkerTimeoutSeconds,
                manualSynthesis,
                autoManualWindow,
                signal: controller.signal,
            });
            const requestId = String(created?.request?.id || "");
            if (!requestId) {
                throw new Error("Failed to create upload request.");
            }
            activeRequestIdRef.current = requestId;
            isPreRunUploadRef.current = false;

            const uploadRows = Array.isArray(created?.files) ? created.files : [];
            if (uploadRows.length !== benchFiles.length) {
                throw new Error("Upload request payload mismatch.");
            }

            queueUploadInFlightRef.current = true;
            try {
                for (let index = 0; index < uploadRows.length; index += 1) {
                    const row = uploadRows[index];
                    const file = benchFiles[index];
                    setUploadProgress((prev) => (prev ? {
                        ...prev,
                        phase: "uploading",
                        requestStatus: "queued",
                        currentFileName: file.name,
                        queueUploaded: index + 1,
                    } : prev));
                    setUploadLiveRows((prev) => updateLocalQueueRow(prev, index, {
                        statusLabel: "adding to queue",
                        tone: "processing",
                        reason: "",
                    }));
                    const putRes = await fetch(String(row.uploadUrl || ""), {
                        method: "PUT",
                        signal: controller.signal,
                        body: file,
                    });
                    if (!putRes.ok) {
                        const errorMessage = await buildQueueUploadErrorMessage(putRes, file.name);
                        setUploadLiveRows((prev) => updateLocalQueueRow(prev, index, {
                            statusLabel: "queue upload failed",
                            tone: "error",
                            reason: errorMessage,
                        }));
                        throw new Error(errorMessage);
                    }
                    setUploadLiveRows((prev) => updateLocalQueueRow(prev, index, {
                        statusLabel: "queued",
                        tone: "queued",
                        reason: "",
                    }));
                }
            } finally {
                queueUploadInFlightRef.current = false;
            }

            const initialRunSnapshot = await runPointsUploadRequest({
                authKey: authKeyDraft,
                requestId,
                signal: controller.signal,
            });
            updateStateFromSnapshot(initialRunSnapshot);
            wakePolling();
            setDescriptionDraft("");
            clearFileInput();
        } catch (err) {
            isPreRunUploadRef.current = false;
            if (err?.name === "AbortError") {
                setUploadError("Upload stopped.");
            } else {
                setUploadError(err?.message || "Failed to upload point.");
            }
            setIsUploading(false);
            setIsUploadStopping(false);
            if (!manualApplyRows.length) {
                setBlockingRequestStatus("");
            }
        } finally {
            isPreRunUploadRef.current = false;
            if (uploadAbortRef.current === controller) {
                uploadAbortRef.current = null;
            }
        }
    }

    const uploadDisabledReason = useMemo(() => getUploadDisabledReason({
        isUploading,
        uploadPhase: uploadProgress?.phase,
        manualApplyRowsLength: manualApplyRows.length,
        blockingRequestStatus,
        waitManualRequestStatus: WAITING_MANUAL_REQUEST_STATUS,
        benchFiles: Array.isArray(benchFiles) ? benchFiles : [],
        selectedChecker,
        selectedParser,
        normalizeCheckerForActor,
        enabledCheckers,
        checkerTleSecondsDraft,
        parserTleSecondsDraft,
        verifyTimeoutQuotaSeconds,
        metricsTimeoutQuotaSeconds,
        maxMultiFileBatchCount,
        maxSingleUploadBytes,
        remainingUploadBytes,
        formatGb,
        descriptionDraft,
    }), [
        isUploading,
        uploadProgress?.phase,
        manualApplyRows.length,
        blockingRequestStatus,
        benchFiles,
        selectedChecker,
        selectedParser,
        normalizeCheckerForActor,
        enabledCheckers,
        checkerTleSecondsDraft,
        parserTleSecondsDraft,
        verifyTimeoutQuotaSeconds,
        metricsTimeoutQuotaSeconds,
        maxMultiFileBatchCount,
        maxSingleUploadBytes,
        remainingUploadBytes,
        formatGb,
        descriptionDraft,
    ]);

    function setManualApplyChecked(key, checked) {
        setManualApplyRows((prev) =>
            prev.map((row) => (row.key === key && !row.disabled ? { ...row, checked: Boolean(checked) } : row))
        );
    }

    async function applyManualRows() {
        if (!activeRequestIdRef.current) {
            setIsManualApplyOpen(false);
            setManualApplyRows([]);
            return;
        }
        const selected = manualApplyRows.filter((row) => row.checked && !row.disabled).map((row) => row.fileId);
        if (selected.length < 1) {
            await closeManualApplyModal({ skipConfirm: true });
            return;
        }
        bumpPollGeneration();
        wakePolling();
        dismissedManualRequestIdRef.current = "";

        setIsManualApplying(true);
        setManualApplyProgress({ processed: 0, total: selected.length });
        const progressToken = uid();
        const progressController = new AbortController();
        let progressPoll = null;
        try {
            progressPoll = setInterval(async () => {
                if (progressController.signal.aborted) return;
                try {
                    const progress = await fetchVerifyPointProgress({
                        token: progressToken,
                        signal: progressController.signal,
                    });
                    setManualApplyProgress((prev) => {
                        if (!prev) return prev;
                        return {
                            ...prev,
                            processed: Math.min(Number(progress?.doneCount || 0), Number(prev.total || selected.length)),
                            total: Math.max(Number(prev.total || 0), Number(progress?.totalCount || selected.length)),
                        };
                    });
                } catch {
                    // Ignore transient polling failures while apply is in progress.
                }
            }, 500);
            const applied = await applyPointsUploadRequestFiles({
                authKey: authKeyDraft,
                requestId: activeRequestIdRef.current,
                fileIds: selected,
                progressToken,
            });
            updateStateFromSnapshot(applied);
            setManualApplyProgress((prev) => (prev ? { ...prev, processed: selected.length } : prev));
            await refreshPointsAfterRequest();
            if (typeof onPointsPersisted === "function") {
                await onPointsPersisted(authKeyDraft);
            }
            if ((applied?.errors || []).length > 0) {
                setUploadError(String(applied.errors[0] || "Failed to apply selected files."));
            } else {
                setUploadError(" ");
            }
        } catch (error) {
            setUploadError(String(error?.message || "Failed to apply selected files."));
        } finally {
            progressController.abort();
            if (progressPoll) {
                clearInterval(progressPoll);
            }
            setIsManualApplying(false);
            setManualApplyProgress(null);
        }
    }

    async function closeManualApplyModal({ skipConfirm = false } = {}) {
        if (!isManualApplyOpen) return;
        if (!skipConfirm) {
            const ok = window.confirm("If you close this window, selected points will not be added to the current view. Continue?");
            if (!ok) return;
        }
        const requestId = activeRequestIdRef.current;
        const normalizedRequestId = String(requestId || "");
        dismissedManualRequestIdRef.current = normalizedRequestId;
        hiddenRequestIdRef.current = normalizedRequestId;
        bumpPollGeneration();
        wakePolling();
        setIsManualApplyOpen(false);
        setManualApplyRows([]);
        clearBlockingRequestControls();
        setUploadError(" ");
        if (requestId) {
            try {
                const closed = await closePointsUploadRequest({
                    authKey: authKeyDraft,
                    requestId,
                });
                updateStateFromSnapshot(closed);
                await refreshPointsAfterRequest();
            } catch (error) {
                try {
                    const actualSnapshot = await fetchPointsUploadRequestStatus({
                        authKey: authKeyDraft,
                        requestId: normalizedRequestId,
                    });
                    const actualStatus = String(actualSnapshot?.request?.status || "").trim().toLowerCase();
                    const hasManualRows = buildManualRows(actualSnapshot?.files || [], {
                        manualFlowEnabled: isManualFlowEnabledForRequest(actualSnapshot?.request || null),
                    }).length > 0;
                    if (actualSnapshot?.request && (!isExternallyManagedQueueStatus(actualStatus) || !hasManualRows)) {
                        hiddenRequestIdRef.current = "";
                        dismissedManualRequestIdRef.current = "";
                        updateStateFromSnapshot(actualSnapshot);
                        if (!isRunnableRequestStatus(actualStatus)) {
                            await refreshPointsAfterRequest();
                        }
                        setUploadError(" ");
                        return;
                    }
                } catch {
                    // Ignore status re-fetch failure and fall back to the last known snapshot.
                }

                hiddenRequestIdRef.current = "";
                dismissedManualRequestIdRef.current = normalizedRequestId;
                const fallbackSnapshot = lastSnapshotRef.current;
                const fallbackRequestId = String(fallbackSnapshot?.request?.id || "");
                if (fallbackRequestId && fallbackRequestId === normalizedRequestId) {
                    updateStateFromSnapshot(fallbackSnapshot);
                }
                setUploadError(String(error?.message || "Failed to close manual verdict request."));
            }
        }
    }

    useEffect(() => {
        const authKey = String(authKeyDraft || "").trim();
        if (!authKey || !currentCommand) return;
        let cancelled = false;
        const scheduleByCurrentState = () => {
            if (pollPausedExternallyRef.current) return;
            const delay = (hiddenRequestIdRef.current || activeRequestIdRef.current)
                ? ACTIVE_QUEUE_STATUS_POLL_MS
                : IDLE_QUEUE_CHECK_MS;
            scheduleNext(delay);
        };
        const scheduleNext = (ms) => {
            if (cancelled || pollPausedExternallyRef.current) return;
            if (pollTimerRef.current) {
                clearTimeout(pollTimerRef.current);
            }
            pollTimerRef.current = setTimeout(() => {
                void poll();
            }, ms);
        };
        const isStalePoll = (generation) => cancelled || generation !== pollGenerationRef.current;
        const poll = async () => {
            if (cancelled) return;
            const generation = pollGenerationRef.current;
            const controller = new AbortController();
            pollInFlightControllerRef.current = controller;
            try {
                const hiddenRequestId = String(hiddenRequestIdRef.current || "");
                const trackedRequestId = String(activeRequestIdRef.current || "");
                if (hiddenRequestId) {
                    try {
                        const hiddenSnapshot = await fetchPointsUploadRequestStatus({
                            authKey,
                            requestId: hiddenRequestId,
                            signal: controller.signal,
                        });
                        if (isStalePoll(generation)) {
                            scheduleByCurrentState();
                            return;
                        }
                        const status = String(hiddenSnapshot?.request?.status || "").toLowerCase();
                        const hasManual = buildManualRows(hiddenSnapshot?.files || [], {
                            manualFlowEnabled: isManualFlowEnabledForRequest(hiddenSnapshot?.request || null),
                        }).length > 0;
                        if (!status || (!isRunnableRequestStatus(status) && !hasManual)) {
                            hiddenRequestIdRef.current = "";
                            pollPausedExternallyRef.current = false;
                            scheduleNext(IDLE_QUEUE_CHECK_MS);
                            return;
                        }
                        if (isExternallyManagedQueueStatus(status)) {
                            pollPausedExternallyRef.current = true;
                            return;
                        }
                        pollPausedExternallyRef.current = false;
                        scheduleNext(ACTIVE_QUEUE_STATUS_POLL_MS);
                    } catch (error) {
                        if (isStalePoll(generation)) {
                            scheduleByCurrentState();
                            return;
                        }
                        if (Number(error?.code || 0) === 404) {
                            hiddenRequestIdRef.current = "";
                            pollPausedExternallyRef.current = false;
                            updateStateFromSnapshot({ request: null, files: [] });
                            scheduleNext(IDLE_QUEUE_CHECK_MS);
                            return;
                        }
                        scheduleNext(ACTIVE_QUEUE_STATUS_POLL_MS);
                    }
                    return;
                }

                if (trackedRequestId) {
                    try {
                        const trackedSnapshot = await fetchPointsUploadRequestStatus({
                            authKey,
                            requestId: trackedRequestId,
                            signal: controller.signal,
                        });
                        if (isStalePoll(generation)) {
                            scheduleByCurrentState();
                            return;
                        }
                        updateStateFromSnapshot(trackedSnapshot);
                        const status = String(trackedSnapshot?.request?.status || "").toLowerCase();
                        const hasRunnableRequest = Boolean(trackedSnapshot?.request?.id) && isRunnableRequestStatus(status);
                        const hasBlockingRequest = Boolean(trackedSnapshot?.request?.id) && isBlockingRequestStatus(status);
                        if (isExternallyManagedQueueStatus(status)) {
                            pollPausedExternallyRef.current = true;
                            if (pollTimerRef.current) {
                                clearTimeout(pollTimerRef.current);
                                pollTimerRef.current = null;
                            }
                            return;
                        }
                        pollPausedExternallyRef.current = false;
                        scheduleNext(hasBlockingRequest ? ACTIVE_QUEUE_STATUS_POLL_MS : IDLE_QUEUE_CHECK_MS);
                        if (!hasRunnableRequest && status !== FREEZED_REQUEST_STATUS) {
                            setIsUploadStopping(false);
                        }
                    } catch (error) {
                        if (isStalePoll(generation)) {
                            scheduleByCurrentState();
                            return;
                        }
                        if (Number(error?.code || 0) === 404) {
                            pollPausedExternallyRef.current = false;
                            updateStateFromSnapshot({ request: null, files: [] });
                            scheduleNext(IDLE_QUEUE_CHECK_MS);
                            return;
                        }
                        scheduleNext(ACTIVE_QUEUE_STATUS_POLL_MS);
                    }
                    return;
                }

                const active = await fetchActivePointsUploadRequest({
                    authKey,
                    signal: controller.signal,
                });
                if (isStalePoll(generation)) {
                    scheduleByCurrentState();
                    return;
                }
                updateStateFromSnapshot(active);
                const status = String(active?.request?.status || "").toLowerCase();
                const hasRunnableRequest = Boolean(active?.request?.id) && isRunnableRequestStatus(status);
                const hasBlockingRequest = Boolean(active?.request?.id) && isBlockingRequestStatus(status);
                if (isExternallyManagedQueueStatus(status)) {
                    pollPausedExternallyRef.current = true;
                    if (pollTimerRef.current) {
                        clearTimeout(pollTimerRef.current);
                        pollTimerRef.current = null;
                    }
                    return;
                }
                pollPausedExternallyRef.current = false;
                scheduleNext(hasBlockingRequest ? ACTIVE_QUEUE_STATUS_POLL_MS : IDLE_QUEUE_CHECK_MS);
                if (!hasRunnableRequest && status !== FREEZED_REQUEST_STATUS) {
                    setIsUploadStopping(false);
                }
            } catch {
                if (cancelled) return;
                if (isStalePoll(generation)) {
                    scheduleByCurrentState();
                    return;
                }
                if (pollPausedExternallyRef.current) {
                    return;
                }
                const retryDelay = (hiddenRequestIdRef.current || activeRequestIdRef.current)
                    ? ACTIVE_QUEUE_STATUS_POLL_MS
                    : IDLE_QUEUE_CHECK_MS;
                scheduleNext(retryDelay);
            } finally {
                if (pollInFlightControllerRef.current === controller) {
                    pollInFlightControllerRef.current = null;
                }
            }
        };
        pollLoopRef.current = poll;
        void poll();

        return () => {
            cancelled = true;
            if (pollTimerRef.current) {
                clearTimeout(pollTimerRef.current);
                pollTimerRef.current = null;
            }
            if (pollInFlightControllerRef.current) {
                pollInFlightControllerRef.current.abort();
                pollInFlightControllerRef.current = null;
            }
            pollPausedExternallyRef.current = false;
            pollLoopRef.current = null;
        };
    }, [authKeyDraft, currentCommand, updateStateFromSnapshot]);

    const showUploadMonitor = Boolean(uploadProgress) || uploadLiveRows.length > 0;

    function openManualApplyModal() {
        if (manualApplyRows.length < 1) return;
        dismissedManualRequestIdRef.current = "";
        setIsManualApplyOpen(true);
    }

    return {
        benchFiles,
        descriptionDraft,
        setDescriptionDraft,
        selectedChecker,
        setSelectedChecker,
        uploadError,
        setUploadError,
        isUploading,
        isUploadStopping,
        uploadProgress,
        uploadLiveRows,
        showUploadMonitor,
        fileInputRef,
        uploadLogText,
        uploadVerdictNote,
        selectedParser,
        setSelectedParser,
        checkerTleSecondsDraft,
        setCheckerTleSecondsDraft,
        parserTleSecondsDraft,
        setParserTleSecondsDraft,
        manualSynthesis,
        setManualSynthesis,
        autoManualWindow,
        setAutoManualWindow,
        isUploadSettingsOpen,
        setIsUploadSettingsOpen,
        manualApplyRows,
        isManualApplyOpen,
        isManualApplying,
        manualApplyProgress,
        showManualApplyButton: manualApplyRows.length > 0 && !isManualApplyOpen,
        openManualApplyModal,
        onFileChange,
        requestStopUpload,
        addPointFromFile,
        uploadDisabledReason,
        canAdd: uploadDisabledReason === "",
        setManualApplyChecked,
        applyManualRows,
        closeManualApplyModal,
        wakeUploadQueuePolling: wakePolling,
    };
}

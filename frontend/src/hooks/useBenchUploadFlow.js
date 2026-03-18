import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MAX_DESCRIPTION_LEN } from "../constants/appConstants.js";
import { parsePosIntCapped } from "../utils/numberUtils.js";
import { getBenchFilesError } from "../utils/benchUploadValidation.js";
import {
    applyPointsUploadRequestFiles,
    closePointsUploadRequest,
    createPointsUploadRequest,
    fetchActivePointsUploadRequest,
    fetchPoints,
    runPointsUploadRequest,
    stopPointsUploadRequest,
} from "../services/apiClient.js";

const RUNNABLE_REQUEST_STATUSES = new Set(["queued", "processing"]);
const FREEZED_REQUEST_STATUS = "freezed";
const WAITING_MANUAL_REQUEST_STATUS = "waiting_manual_verdict";

function isRunnableRequestStatus(statusRaw) {
    return RUNNABLE_REQUEST_STATUSES.has(String(statusRaw || "").trim().toLowerCase());
}

function hasManualVerdictPending(row) {
    return !row?.applied && Boolean(row?.canApply);
}

function mapPhase(phaseRaw, statusRaw) {
    const phase = String(phaseRaw || "").trim().toLowerCase();
    const status = String(statusRaw || "").trim().toLowerCase();
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

function buildUploadLogText(files) {
    if (!Array.isArray(files) || files.length === 0) return "";
    const rows = files
        .filter((row) => ["processed", "non-processed"].includes(String(row?.processState || "").toLowerCase()))
        .map((row) => {
            const success = Boolean(row?.applied);
            const verdict = hasManualVerdictPending(row) ? "waiting manual verdict" : String(row?.verdict || "pending");
            const reason = String(row?.verdictReason || "").trim();
            return `file=${String(row?.originalFileName || "unknown")}; success=${success ? "true" : "false"}; verdict=${verdict}; reason=${reason || "-"}`;
        });
    return rows.join("\n");
}

function buildManualRows(files) {
    if (!Array.isArray(files)) return [];
    return files
        .filter((row) => hasManualVerdictPending(row))
        .map((row) => {
            const verdict = String(row?.verdict || "pending");
            return {
                key: String(row.id || ""),
                fileId: String(row.id || ""),
                checked: Boolean(row?.defaultChecked) && verdict === "non-verified",
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
    if (isUploading) return "Upload is already in progress.";
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
    const description = descriptionDraft.trim() || "schema";
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
    if (verdict === "blocked") {
        return { statusLabel: "blocked", tone: "error" };
    }
    return { statusLabel: verdict || "processed", tone: "success" };
}

function buildLiveRows(files) {
    if (!Array.isArray(files)) return [];
    return files.map((row) => {
        const status = buildLiveRowStatus(row);
        const orderIndex = Number(row?.orderIndex);
        const fileName = String(row?.originalFileName || "unknown");
        return {
            key: Number.isFinite(orderIndex)
                ? `queue:${orderIndex}:${fileName}`
                : `queue:${fileName}`,
            fileName,
            statusLabel: status.statusLabel,
            tone: status.tone,
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
    const [isUploadSettingsOpen, setIsUploadSettingsOpen] = useState(false);
    const [manualApplyRows, setManualApplyRows] = useState(() => []);
    const [isManualApplyOpen, setIsManualApplyOpen] = useState(false);
    const [isManualApplying, setIsManualApplying] = useState(false);
    const [manualApplyProgress, setManualApplyProgress] = useState(null);

    const uploadAbortRef = useRef(null);
    const activeRequestIdRef = useRef("");
    const dismissedManualRequestIdRef = useRef("");
    const activeRequestMissingPollsRef = useRef(0);
    const isPageUnloadingRef = useRef(false);

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
        if (!description) return "schema";
        return description;
    }

    function parseCheckerTimeoutSeconds() {
        return parsePosIntCapped(checkerTleSecondsDraft, verifyTimeoutQuotaSeconds);
    }

    function parseParserTimeoutSeconds() {
        return parsePosIntCapped(parserTleSecondsDraft, metricsTimeoutQuotaSeconds);
    }

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

    const resetBlockingRequestState = useCallback(() => {
        activeRequestIdRef.current = "";
        setBlockingRequestStatus("");
        setUploadProgress(null);
        setUploadLiveRows([]);
        setManualApplyRows([]);
        setManualApplyProgress(null);
        setIsManualApplyOpen(false);
    }, []);

    const updateStateFromSnapshot = useCallback((snapshot) => {
        const request = snapshot?.request || null;
        const files = Array.isArray(snapshot?.files) ? snapshot.files : [];
        if (!request) {
            dismissedManualRequestIdRef.current = "";
            setIsUploading(false);
            setIsUploadStopping(false);
            resetBlockingRequestState();
            return;
        }
        const requestId = String(request.id || "");
        if (dismissedManualRequestIdRef.current && dismissedManualRequestIdRef.current !== requestId) {
            dismissedManualRequestIdRef.current = "";
        }

        const lowerStatus = String(request.status || "").toLowerCase();
        const runnable = isRunnableRequestStatus(lowerStatus);
        const manualRows = runnable ? [] : buildManualRows(files);
        const hasPendingManualVerdict = manualRows.length > 0;
        const shouldKeepMonitor = runnable || hasPendingManualVerdict;

        if (shouldKeepMonitor) {
            activeRequestIdRef.current = requestId;
            setBlockingRequestStatus(lowerStatus);
            setUploadProgress({
                done: Number(request.doneCount || 0),
                total: Number(request.totalCount || 0),
                verified: Number(request.verifiedCount || 0),
                phase: hasPendingManualVerdict && !runnable ? "waiting-manual" : mapPhase(request.currentPhase, request.status),
                currentFileName: String(request.currentFileName || ""),
                secondsRemaining: null,
                transitionTarget: "next-circuit",
            });
            setUploadLiveRows(buildLiveRows(files));
        } else {
            resetBlockingRequestState();
        }

        setIsUploading(runnable);
        if (!runnable) {
            setIsUploadStopping(false);
        }
        setUploadLogText(buildUploadLogText(files));
        setManualApplyRows(manualRows);
        if (hasPendingManualVerdict
            && (lowerStatus === "interrupted" || lowerStatus === "failed")
            && dismissedManualRequestIdRef.current !== requestId) {
            setIsManualApplyOpen(true);
        } else if (!hasPendingManualVerdict) {
            setIsManualApplyOpen(false);
        }

        if (lowerStatus === "interrupted") {
            setUploadError(String(request.error || "Upload stopped."));
        } else if (lowerStatus === "failed") {
            setUploadError(String(request.error || "Upload request failed."));
        } else {
            setUploadError(" ");
        }
    }, [resetBlockingRequestState]);

    async function requestStopUpload() {
        if (!isUploading || !activeRequestIdRef.current) return;
        setIsUploadStopping(true);
        setUploadError("Stopping upload after current step...");
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
        setBlockingRequestStatus("queued");
        setUploadProgress({
            done: 0,
            total: benchFiles.length,
            verified: 0,
            phase: "uploading",
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
                signal: controller.signal,
            });
            const requestId = String(created?.request?.id || "");
            if (!requestId) {
                throw new Error("Failed to create upload request.");
            }
            activeRequestIdRef.current = requestId;

            const uploadRows = Array.isArray(created?.files) ? created.files : [];
            if (uploadRows.length !== benchFiles.length) {
                throw new Error("Upload request payload mismatch.");
            }

            for (let index = 0; index < uploadRows.length; index += 1) {
                const row = uploadRows[index];
                const file = benchFiles[index];
                setUploadProgress((prev) => (prev ? {
                    ...prev,
                    phase: "uploading",
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

            const started = await runPointsUploadRequest({
                authKey: authKeyDraft,
                requestId,
                signal: controller.signal,
            });
            updateStateFromSnapshot(started);
            const startedStatus = String(started?.request?.status || "").toLowerCase();
            if (!isRunnableRequestStatus(startedStatus)) {
                await refreshPointsAfterRequest();
            }
            setDescriptionDraft("");
            clearFileInput();
        } catch (err) {
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
            if (uploadAbortRef.current === controller) {
                uploadAbortRef.current = null;
            }
        }
    }

    const uploadDisabledReason = useMemo(() => getUploadDisabledReason({
        isUploading,
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
        dismissedManualRequestIdRef.current = "";

        setIsManualApplying(true);
        setManualApplyProgress({ processed: 0, total: selected.length });
        try {
            const errors = [];
            let processed = 0;
            for (const fileId of selected) {
                if (!activeRequestIdRef.current) break;
                try {
                    const applied = await applyPointsUploadRequestFiles({
                        authKey: authKeyDraft,
                        requestId: activeRequestIdRef.current,
                        fileIds: [fileId],
                    });
                    updateStateFromSnapshot(applied);
                    if ((applied?.errors || []).length > 0) {
                        errors.push(...applied.errors.map((message) => String(message || "Failed to apply selected file.")));
                    }
                } catch (error) {
                    errors.push(String(error?.message || "Failed to apply selected file."));
                } finally {
                    processed += 1;
                    setManualApplyProgress((prev) => (prev ? { ...prev, processed } : prev));
                }
            }
            await refreshPointsAfterRequest();
            if (errors.length > 0) {
                setUploadError(errors[0]);
            } else {
                setUploadError(" ");
            }
        } finally {
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
        dismissedManualRequestIdRef.current = String(requestId || "");
        setIsManualApplyOpen(false);
        setManualApplyRows([]);
        resetBlockingRequestState();
        setUploadError(" ");
        if (requestId) {
            try {
                await closePointsUploadRequest({
                    authKey: authKeyDraft,
                    requestId,
                });
            } catch {
                setUploadError("Failed to close manual verdict request.");
            }
        }
    }

    useEffect(() => {
        const authKey = String(authKeyDraft || "").trim();
        if (!authKey || !currentCommand) return;
        let cancelled = false;
        let timer = null;
        let inFlightController = null;
        const poll = async () => {
            if (cancelled) return;
            const controller = new AbortController();
            inFlightController = controller;
            try {
                const active = await fetchActivePointsUploadRequest({
                    authKey,
                    signal: controller.signal,
                });
                if (cancelled) return;
                const hasServerRequest = Boolean(active?.request?.id);
                const hasLocalBlockingRequest = Boolean(activeRequestIdRef.current);
                if (!hasServerRequest && hasLocalBlockingRequest) {
                    activeRequestMissingPollsRef.current += 1;
                    const nextDelay = activeRequestMissingPollsRef.current >= 3 ? ACTIVE_QUEUE_STATUS_POLL_MS : 600;
                    timer = setTimeout(() => {
                        void poll();
                    }, nextDelay);
                    return;
                }
                activeRequestMissingPollsRef.current = 0;
                updateStateFromSnapshot(active);
                const status = String(active?.request?.status || "").toLowerCase();
                const hasRunnableRequest = Boolean(active?.request?.id) && isRunnableRequestStatus(status);
                const hasBlockingRequest = Boolean(active?.request?.id);
                const nextDelay = hasBlockingRequest ? ACTIVE_QUEUE_STATUS_POLL_MS : IDLE_QUEUE_CHECK_MS;
                timer = setTimeout(() => {
                    void poll();
                }, nextDelay);
                if (!hasRunnableRequest && status !== FREEZED_REQUEST_STATUS) {
                    setIsUploadStopping(false);
                }
            } catch {
                if (cancelled) return;
                const retryDelay = activeRequestIdRef.current ? ACTIVE_QUEUE_STATUS_POLL_MS : IDLE_QUEUE_CHECK_MS;
                timer = setTimeout(() => {
                    void poll();
                }, retryDelay);
            } finally {
                if (inFlightController === controller) {
                    inFlightController = null;
                }
            }
        };
        void poll();

        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
            if (inFlightController) inFlightController.abort();
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
    };
}

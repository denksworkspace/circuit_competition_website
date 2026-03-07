import { useEffect, useMemo, useRef, useState } from "react";
import { MAX_DESCRIPTION_LEN } from "../constants/appConstants.js";
import { parsePosIntCapped } from "../utils/numberUtils.js";
import { buildStoredFileName, parseBenchFileName, uid } from "../utils/pointUtils.js";
import { getBenchFilesError } from "../utils/benchUploadValidation.js";
import { requestUploadUrl, savePoint } from "../services/apiClient.js";
import { runUploadSession } from "./benchUpload/runUploadSession.js";

export function useBenchUploadFlow({
    authKeyDraft,
    currentCommand,
    setCurrentCommand,
    setPoints,
    setLastAddedId,
    setBenchmarkFilter,
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

    const uploadCountdownRef = useRef(null);
    const uploadStopRequestedRef = useRef(false);
    const uploadAbortRef = useRef(null);

    useEffect(() => {
        return () => {
            if (uploadCountdownRef.current) {
                clearInterval(uploadCountdownRef.current);
                uploadCountdownRef.current = null;
            }
            if (uploadAbortRef.current) {
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
            parseBenchFileName,
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

    function stopUploadCountdown() {
        if (uploadCountdownRef.current) {
            clearInterval(uploadCountdownRef.current);
            uploadCountdownRef.current = null;
        }
    }

    function startUploadCountdown(seconds) {
        stopUploadCountdown();
        setUploadProgress((prev) => (prev ? { ...prev, secondsRemaining: seconds } : prev));
        uploadCountdownRef.current = setInterval(() => {
            setUploadProgress((prev) => {
                if (!prev) return prev;
                const nextSeconds = Math.max(0, Number(prev.secondsRemaining || 0) - 1);
                return { ...prev, secondsRemaining: nextSeconds };
            });
        }, 1000);
    }

    function requestStopUpload() {
        if (!isUploading) return;
        uploadStopRequestedRef.current = true;
        if (uploadAbortRef.current) {
            uploadAbortRef.current.abort();
            uploadAbortRef.current = null;
        }
        setIsUploadStopping(true);
        setUploadError("Stopping upload after current step...");
    }

    async function createPointFromUploadedFile(sourceFile, parsed, description, verificationResult = null, { signal } = {}) {
        const batchSize = Math.max(1, Number(benchFiles.length || 1));
        const pointId = uid();
        const storedFileName = buildStoredFileName({
            benchmark: parsed.benchmark,
            delay: parsed.delay,
            area: parsed.area,
            pointId,
            sender: currentCommand.name,
        });
        const uploadMeta = await requestUploadUrl({
            authKey: authKeyDraft,
            fileName: storedFileName,
            fileSize: sourceFile.size,
            batchSize,
            signal,
        });
        const putRes = await fetch(uploadMeta.uploadUrl, {
            method: "PUT",
            signal,
            body: sourceFile,
        });
        if (!putRes.ok) {
            throw new Error("Failed to upload file to S3.");
        }

        const point = {
            id: pointId,
            benchmark: parsed.benchmark,
            delay: parsed.delay,
            area: parsed.area,
            description,
            sender: currentCommand.name,
            fileName: storedFileName,
            status: verificationResult?.status || "non-verified",
            checkerVersion: verificationResult?.checkerVersion || null,
        };

        const savedPayload = await savePoint(
            {
                ...point,
                authKey: authKeyDraft,
                fileSize: sourceFile.size,
                batchSize,
            },
            { signal }
        );

        if (savedPayload?.quota) {
            setCurrentCommand((prev) => (prev ? { ...prev, ...savedPayload.quota } : prev));
        }

        return savedPayload?.point || point;
    }

    async function addPointFromFile(e) {
        e.preventDefault();
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
        uploadStopRequestedRef.current = false;
        setUploadProgress({
            done: 0,
            total: benchFiles.length,
            verified: 0,
            phase: "preparing",
            currentFileName: "",
            secondsRemaining: null,
            transitionTarget: "next-circuit",
        });
        setUploadLogText("");
        setUploadVerdictNote("");
        const controller = new AbortController();
        uploadAbortRef.current = controller;
        try {
            await runUploadSession({
                benchFiles,
                selectedParser,
                checkerSelection,
                checkerTimeoutSeconds,
                parserTimeoutSeconds,
                enabledCheckers,
                authKeyDraft,
                currentCommandName: currentCommand?.name,
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
            });
        } finally {
            stopUploadCountdown();
            uploadStopRequestedRef.current = false;
            setIsUploadStopping(false);
            if (uploadAbortRef.current === controller) {
                uploadAbortRef.current = null;
            }
            setIsUploading(false);
            setUploadProgress(null);
        }
    }

    const uploadDisabledReason = useMemo(() => {
        if (isUploading) return "Upload is already in progress.";
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
            parseBenchFileName,
        });
        if (filesError) return filesError;
        const description = descriptionDraft.trim() || "schema";
        if (description.length > MAX_DESCRIPTION_LEN) {
            return `Description is too long (max ${MAX_DESCRIPTION_LEN}).`;
        }
        return "";
    }, [
        isUploading,
        benchFiles,
        selectedChecker,
        selectedParser,
        verifyTimeoutQuotaSeconds,
        metricsTimeoutQuotaSeconds,
        maxMultiFileBatchCount,
        maxSingleUploadBytes,
        remainingUploadBytes,
        formatGb,
        checkerTleSecondsDraft,
        parserTleSecondsDraft,
        descriptionDraft,
        normalizeCheckerForActor,
        enabledCheckers,
    ]);

    function setManualApplyChecked(key, checked) {
        setManualApplyRows((prev) =>
            prev.map((row) => (row.key === key ? { ...row, checked: Boolean(checked) } : row))
        );
    }

    async function applyManualRows() {
        const selected = manualApplyRows.filter((row) => row.checked);
        if (selected.length === 0) {
            setIsManualApplyOpen(false);
            setManualApplyRows([]);
            return;
        }

        setIsManualApplying(true);
        try {
            const savedPoints = [];
            for (const row of selected) {
                try {
                    const saved = await createPointFromUploadedFile(
                        row.candidate.file,
                        row.candidate.parsed,
                        String(row.candidate.description || "schema"),
                        row.candidate.verificationResult
                    );
                    savedPoints.push(saved);
                } catch {
                    // Ignore failed rows here; detailed upload errors are still surfaced via upload log in main flow.
                }
            }

            if (savedPoints.length > 0) {
                setPoints((prev) => [...savedPoints.reverse(), ...prev]);
                const latestSaved = savedPoints[savedPoints.length - 1];
                setLastAddedId(latestSaved.id);
                setBenchmarkFilter(String(latestSaved.benchmark));
            }
            setUploadError(" ");
            setIsManualApplyOpen(false);
            setManualApplyRows([]);
        } finally {
            setIsManualApplying(false);
        }
    }

    function closeManualApplyModal() {
        if (!isManualApplyOpen) return;
        const ok = window.confirm("If you close this window, selected points will not be added to the current view. Continue?");
        if (!ok) return;
        setIsManualApplyOpen(false);
        setManualApplyRows([]);
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

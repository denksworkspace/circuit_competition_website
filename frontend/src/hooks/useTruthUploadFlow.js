// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { useRef, useState } from "react";
import { planTruthTablesUpload, requestTruthUploadUrl, saveTruthTable } from "../services/apiClient.js";
import { parseTruthFileName, toTruthLogText } from "../utils/uploadFlowUtils.js";

const MAX_TRUTH_BATCH_FILES = 100;

export function useTruthUploadFlow({
    authKeyDraft,
    maxSingleUploadBytes,
    remainingUploadBytes,
    formatGb,
}) {
    const [truthFiles, setTruthFiles] = useState(() => []);
    const truthFilesInputRef = useRef(null);
    const [isTruthUploading, setIsTruthUploading] = useState(false);
    const [truthUploadProgress, setTruthUploadProgress] = useState(null);
    const [truthUploadError, setTruthUploadError] = useState("");
    const [truthUploadLogText, setTruthUploadLogText] = useState("");
    const [truthConflicts, setTruthConflicts] = useState(() => []);
    const [isTruthConflictModalOpen, setIsTruthConflictModalOpen] = useState(false);

    function clearTruthFileInput() {
        setTruthFiles([]);
        if (truthFilesInputRef.current) truthFilesInputRef.current.value = "";
    }

    function onTruthFilesChange(e) {
        const files = Array.from(e.target.files || []);
        setTruthFiles(files);
        if (files.length > MAX_TRUTH_BATCH_FILES) {
            setTruthUploadError(`Too many files selected. Maximum is ${MAX_TRUTH_BATCH_FILES}.`);
        } else {
            const tooLargeTruth = files.find((file) => Number(file.size || 0) > maxSingleUploadBytes);
            if (tooLargeTruth) {
                setTruthUploadError(`File is too large. Maximum size is ${formatGb(maxSingleUploadBytes)} GB.`);
            } else {
                const batchBytes = files.reduce((sum, file) => sum + Number(file.size || 0), 0);
                if (batchBytes > remainingUploadBytes) {
                    setTruthUploadError(`Multi-file quota exceeded. Remaining: ${formatGb(remainingUploadBytes)} GB.`);
                } else {
                    setTruthUploadError("");
                }
            }
        }
        setTruthUploadLogText("");
        setTruthUploadProgress(null);
        setTruthConflicts([]);
        setIsTruthConflictModalOpen(false);
    }

    async function uploadAndSaveTruthFile(file, { allowReplace = false, allowCreateBenchmark = false } = {}) {
        const batchSize = Math.max(1, truthFiles.length);
        const uploadMeta = await requestTruthUploadUrl({
            authKey: authKeyDraft,
            fileName: file.name,
            fileSize: file.size,
            batchSize,
        });
        const putRes = await fetch(uploadMeta.uploadUrl, {
            method: "PUT",
            body: file,
        });
        if (!putRes.ok) {
            throw new Error("Failed to upload truth file to S3.");
        }
        await saveTruthTable({
            authKey: authKeyDraft,
            fileName: file.name,
            fileSize: file.size,
            batchSize,
            allowReplace,
            allowCreateBenchmark,
        });
    }

    async function uploadTruthTables() {
        if (truthFiles.length === 0) {
            setTruthUploadError("Select at least one .truth file.");
            return;
        }
        if (truthFiles.length > MAX_TRUTH_BATCH_FILES) {
            setTruthUploadError(`Too many files selected. Maximum is ${MAX_TRUTH_BATCH_FILES}.`);
            return;
        }
        const tooLargeTruth = truthFiles.find((file) => Number(file.size || 0) > maxSingleUploadBytes);
        if (tooLargeTruth) {
            setTruthUploadError(`File is too large. Maximum size is ${formatGb(maxSingleUploadBytes)} GB.`);
            return;
        }
        const batchBytes = truthFiles.reduce((sum, file) => sum + Number(file.size || 0), 0);
        if (batchBytes > remainingUploadBytes) {
            setTruthUploadError(`Multi-file quota exceeded. Remaining: ${formatGb(remainingUploadBytes)} GB.`);
            return;
        }
        setIsTruthUploading(true);
        setTruthUploadProgress({ done: 0, total: truthFiles.length });
        setTruthUploadError("");
        setTruthUploadLogText("");
        setTruthConflicts([]);
        setIsTruthConflictModalOpen(false);

        try {
            const invalidName = truthFiles.find((file) => !parseTruthFileName(file.name).ok);
            if (invalidName) {
                setTruthUploadError("Invalid truth file name. Expected: bench{200..299}.truth");
                return;
            }

            const plan = await planTruthTablesUpload({
                authKey: authKeyDraft,
                fileNames: truthFiles.map((f) => f.name),
            });
            const fileByName = new Map(truthFiles.map((file) => [file.name, file]));
            const logRows = [];
            const pending = [];

            for (const item of plan.files) {
                const sourceFile = fileByName.get(item.fileName);
                if (!sourceFile) continue;
                if (item.action === "invalid") {
                    logRows.push({
                        fileName: item.fileName,
                        success: false,
                        reason: item.reason || "Invalid truth file.",
                    });
                    setTruthUploadProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
                    continue;
                }
                if (item.action === "requires_replace" || item.action === "requires_create_benchmark") {
                    pending.push({
                        ...item,
                        checked: false,
                    });
                    setTruthUploadProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
                    continue;
                }
                try {
                    await uploadAndSaveTruthFile(sourceFile);
                    logRows.push({
                        fileName: item.fileName,
                        success: true,
                        reason: "Uploaded successfully.",
                    });
                } catch (error) {
                    logRows.push({
                        fileName: item.fileName,
                        success: false,
                        reason: error?.message || "Failed to upload truth file.",
                    });
                }
                setTruthUploadProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
            }

            if (pending.length > 0) {
                setTruthConflicts(pending);
                setIsTruthConflictModalOpen(true);
            }

            if (logRows.length > 0) {
                setTruthUploadLogText(toTruthLogText(logRows));
            }
            if (pending.length > 0) {
                setTruthUploadError("Some files require confirmation. Review the conflict dialog.");
            } else {
                const failed = logRows.filter((row) => !row.success).length;
                if (failed > 0) {
                    setTruthUploadError("Some truth files failed. Download log for details.");
                }
                clearTruthFileInput();
            }
        } catch (error) {
            setTruthUploadError(error?.message || "Failed to upload truth files.");
        } finally {
            setIsTruthUploading(false);
            setTruthUploadProgress(null);
        }
    }

    function setTruthConflictChecked(fileName, checked) {
        setTruthConflicts((prev) => prev.map((row) => (row.fileName === fileName ? { ...row, checked } : row)));
    }

    function selectAllTruthConflicts() {
        setTruthConflicts((prev) => prev.map((row) => ({ ...row, checked: true })));
    }

    function clearAllTruthConflicts() {
        setTruthConflicts((prev) => prev.map((row) => ({ ...row, checked: false })));
    }

    async function applyTruthConflicts() {
        if (truthConflicts.length === 0) {
            setIsTruthConflictModalOpen(false);
            return;
        }
        setIsTruthUploading(true);
        setTruthUploadProgress({ done: 0, total: truthConflicts.length });
        try {
            const fileByName = new Map(truthFiles.map((file) => [file.name, file]));
            const logRows = truthUploadLogText
                ? truthUploadLogText.split("\n").filter(Boolean).map((line) => {
                    const parts = line.split("; ");
                    return {
                        fileName: parts[0]?.replace(/^file=/, "") || "<unknown>",
                        success: parts[1]?.replace(/^success=/, "") === "true",
                        reason: parts[2]?.replace(/^reason=/, "") || "",
                    };
                })
                : [];

            for (const item of truthConflicts) {
                if (!item.checked) {
                    logRows.push({
                        fileName: item.fileName,
                        success: false,
                        reason: "Skipped by admin decision.",
                    });
                    setTruthUploadProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
                    continue;
                }
                const sourceFile = fileByName.get(item.fileName);
                if (!sourceFile) {
                    logRows.push({
                        fileName: item.fileName,
                        success: false,
                        reason: "Local file is missing.",
                    });
                    setTruthUploadProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
                    continue;
                }
                try {
                    await uploadAndSaveTruthFile(sourceFile, {
                        allowReplace: item.action === "requires_replace",
                        allowCreateBenchmark: item.action === "requires_create_benchmark",
                    });
                    logRows.push({
                        fileName: item.fileName,
                        success: true,
                        reason: "Uploaded successfully after confirmation.",
                    });
                } catch (error) {
                    logRows.push({
                        fileName: item.fileName,
                        success: false,
                        reason: error?.message || "Failed to upload truth file.",
                    });
                }
                setTruthUploadProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
            }

            setTruthUploadLogText(toTruthLogText(logRows));
            const failed = logRows.filter((row) => !row.success).length;
            setTruthUploadError(failed > 0 ? "Some truth files failed. Download log for details." : "");
            setTruthConflicts([]);
            setIsTruthConflictModalOpen(false);
            clearTruthFileInput();
        } finally {
            setIsTruthUploading(false);
            setTruthUploadProgress(null);
        }
    }

    function closeTruthConflictModal() {
        setIsTruthConflictModalOpen(false);
    }

    return {
        truthFilesInputRef,
        onTruthFilesChange,
        uploadTruthTables,
        isTruthUploading,
        truthUploadError,
        truthUploadLogText,
        truthUploadProgress,
        truthConflicts,
        isTruthConflictModalOpen,
        setTruthConflictChecked,
        selectAllTruthConflicts,
        clearAllTruthConflicts,
        applyTruthConflicts,
        closeTruthConflictModal,
    };
}

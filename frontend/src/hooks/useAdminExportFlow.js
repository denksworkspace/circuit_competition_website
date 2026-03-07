import { useEffect, useRef, useState } from "react";
import { exportAdminDatabase, exportAdminSchemesZip, fetchAdminExportProgress } from "../services/apiClient.js";
import { uid } from "../utils/pointUtils.js";
import { downloadBlobAsFile } from "../utils/fileDownloadUtils.js";

export function useAdminExportFlow({ authKeyDraft }) {
    const [isAdminSchemesExporting, setIsAdminSchemesExporting] = useState(false);
    const [isAdminDbExporting, setIsAdminDbExporting] = useState(false);
    const [adminSchemesExportProgress, setAdminSchemesExportProgress] = useState(null);
    const [adminDbExportProgress, setAdminDbExportProgress] = useState(null);
    const [adminExportError, setAdminExportError] = useState("");
    const [adminSchemesExportScope, setAdminSchemesExportScope] = useState("all");
    const [adminSchemesVerdictScope, setAdminSchemesVerdictScope] = useState("verify");
    const [isAdminSchemesExportModalOpen, setIsAdminSchemesExportModalOpen] = useState(false);

    const adminSchemesExportAbortRef = useRef(null);
    const adminDbExportAbortRef = useRef(null);
    const adminSchemesExportPollRef = useRef(null);
    const adminDbExportPollRef = useRef(null);

    useEffect(() => {
        const schemesPoll = adminSchemesExportPollRef.current;
        const dbPoll = adminDbExportPollRef.current;
        const schemesAbort = adminSchemesExportAbortRef.current;
        const dbAbort = adminDbExportAbortRef.current;
        return () => {
            if (schemesPoll) clearInterval(schemesPoll);
            if (dbPoll) clearInterval(dbPoll);
            if (schemesAbort) schemesAbort.abort();
            if (dbAbort) dbAbort.abort();
        };
    }, []);

    function refForWhich(which) {
        return which === "schemes" ? adminSchemesExportPollRef : adminDbExportPollRef;
    }

    function stopAdminExportProgressPoll(which) {
        const ref = refForWhich(which);
        if (!ref.current) return;
        clearInterval(ref.current);
        ref.current = null;
    }

    function startAdminExportProgressPoll({ token, signal, which }) {
        const setProgress = which === "schemes" ? setAdminSchemesExportProgress : setAdminDbExportProgress;
        stopAdminExportProgressPoll(which);
        const poll = async () => {
            if (signal.aborted) return;
            try {
                const progress = await fetchAdminExportProgress({ token, signal });
                setProgress(progress);
                if (progress?.doneFlag) {
                    stopAdminExportProgressPoll(which);
                }
            } catch {
                // Keep polling; transient failures are expected while export starts.
            }
        };
        refForWhich(which).current = setInterval(poll, 500);
        poll();
    }

    function stopAdminSchemesExport() {
        if (!adminSchemesExportAbortRef.current) return;
        adminSchemesExportAbortRef.current.abort();
        adminSchemesExportAbortRef.current = null;
    }

    function stopAdminDbExport() {
        if (!adminDbExportAbortRef.current) return;
        adminDbExportAbortRef.current.abort();
        adminDbExportAbortRef.current = null;
    }

    async function downloadAllSchemesZip() {
        if (!authKeyDraft.trim()) return;
        if (isAdminSchemesExporting) {
            stopAdminSchemesExport();
            return;
        }
        setAdminExportError("");
        setIsAdminSchemesExportModalOpen(true);
    }

    async function startAdminSchemesExportFromModal() {
        if (!authKeyDraft.trim()) return;
        if (isAdminSchemesExporting) return;
        const exportScope = adminSchemesExportScope === "pareto" ? "pareto" : "all";
        const verdictScope = adminSchemesVerdictScope === "all" ? "all" : "verify";
        setAdminExportError("");
        setAdminSchemesExportProgress({
            status: "queued",
            done: 0,
            total: 0,
            unit: "files",
            scope: exportScope,
            verdictScope,
        });
        setIsAdminSchemesExporting(true);
        setIsAdminSchemesExportModalOpen(false);
        const controller = new AbortController();
        adminSchemesExportAbortRef.current = controller;
        const progressToken = uid();
        startAdminExportProgressPoll({ token: progressToken, signal: controller.signal, which: "schemes" });
        try {
            const result = await exportAdminSchemesZip({
                authKey: authKeyDraft,
                progressToken,
                signal: controller.signal,
                scope: exportScope,
                verdictScope,
            });
            if (result?.mode === "zip") {
                downloadBlobAsFile(result.blob, result.fileName || "schemes-export.zip");
            } else {
                const saved = Number(result?.savedFiles || 0);
                const skipped = Number(result?.skippedAlreadyExported || 0);
                const exportDir = String(result?.exportDir || "");
                window.alert(
                    `Saved files: ${saved}\nSkipped (already exported): ${skipped}\nFolder: ${exportDir || "(unknown)"}`
                );
            }
        } catch (error) {
            if (error?.name === "AbortError") {
                setAdminExportError("Schemes export cancelled.");
                return;
            }
            setAdminExportError(error?.message || "Failed to export schemes archive.");
        } finally {
            if (adminSchemesExportAbortRef.current === controller) {
                adminSchemesExportAbortRef.current = null;
            }
            stopAdminExportProgressPoll("schemes");
            setIsAdminSchemesExporting(false);
        }
    }

    async function downloadDatabaseExport() {
        if (!authKeyDraft.trim()) return;
        if (isAdminDbExporting) {
            stopAdminDbExport();
            return;
        }
        setAdminExportError("");
        setAdminDbExportProgress({
            status: "queued",
            done: 0,
            total: 0,
            unit: "tables",
        });
        setIsAdminDbExporting(true);
        const controller = new AbortController();
        adminDbExportAbortRef.current = controller;
        const progressToken = uid();
        startAdminExportProgressPoll({ token: progressToken, signal: controller.signal, which: "db" });
        try {
            const { blob, fileName } = await exportAdminDatabase({
                authKey: authKeyDraft,
                progressToken,
                signal: controller.signal,
            });
            downloadBlobAsFile(blob, fileName || "database-export.sql");
        } catch (error) {
            if (error?.name === "AbortError") {
                setAdminExportError("Database export cancelled.");
                return;
            }
            setAdminExportError(error?.message || "Failed to export database.");
        } finally {
            if (adminDbExportAbortRef.current === controller) {
                adminDbExportAbortRef.current = null;
            }
            stopAdminExportProgressPoll("db");
            setIsAdminDbExporting(false);
        }
    }

    return {
        isAdminSchemesExporting,
        isAdminDbExporting,
        adminSchemesExportProgress,
        adminDbExportProgress,
        adminExportError,
        adminSchemesExportScope,
        setAdminSchemesExportScope,
        adminSchemesVerdictScope,
        setAdminSchemesVerdictScope,
        isAdminSchemesExportModalOpen,
        setIsAdminSchemesExportModalOpen,
        downloadAllSchemesZip,
        startAdminSchemesExportFromModal,
        downloadDatabaseExport,
    };
}

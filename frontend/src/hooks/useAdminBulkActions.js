import { useEffect, useRef, useState } from "react";
import {
    applyAdminIdenticalResolutions,
    applyAdminPointStatuses,
    fetchPoints,
    fetchVerifyPointProgress,
    runAdminBulkVerifyPoint,
    runAdminIdenticalAudit,
    runAdminMetricsAuditPoint,
} from "../services/apiClient.js";
import { uid } from "../utils/pointUtils.js";
import { appendTextLog } from "../utils/uploadFlowUtils.js";

export function useAdminBulkActions({
    authKeyDraft,
    points,
    setPoints,
    setAdminPanelError,
    normalizeCheckerForActor,
    enabledCheckers,
    defaultCheckerVersion,
}) {
    const [isBulkVerifyRunning, setIsBulkVerifyRunning] = useState(false);
    const [selectedBulkVerifyChecker, setSelectedBulkVerifyChecker] = useState(defaultCheckerVersion);
    const [bulkVerifyIncludeVerified, setBulkVerifyIncludeVerified] = useState(true);
    const [bulkVerifyCurrentFileName, setBulkVerifyCurrentFileName] = useState("");
    const [bulkVerifyLogText, setBulkVerifyLogText] = useState("");
    const [isBulkMetricsAuditRunning, setIsBulkMetricsAuditRunning] = useState(false);
    const [bulkMetricsAuditCurrentFileName, setBulkMetricsAuditCurrentFileName] = useState("");
    const [bulkMetricsAuditLogText, setBulkMetricsAuditLogText] = useState("");
    const [bulkVerifyProgress, setBulkVerifyProgress] = useState(null);
    const [bulkMetricsAuditProgress, setBulkMetricsAuditProgress] = useState(null);
    const [bulkVerifyCandidates, setBulkVerifyCandidates] = useState(() => []);
    const [isBulkVerifyApplyModalOpen, setIsBulkVerifyApplyModalOpen] = useState(false);
    const [isBulkIdenticalAuditRunning, setIsBulkIdenticalAuditRunning] = useState(false);
    const [bulkIdenticalAuditSummary, setBulkIdenticalAuditSummary] = useState(null);
    const [bulkIdenticalAuditLogText, setBulkIdenticalAuditLogText] = useState("");
    const [bulkIdenticalAuditProgress, setBulkIdenticalAuditProgress] = useState(null);
    const [bulkIdenticalAuditCurrentFileName, setBulkIdenticalAuditCurrentFileName] = useState("");
    const [bulkIdenticalGroups, setBulkIdenticalGroups] = useState(() => []);
    const [isBulkIdenticalApplyModalOpen, setIsBulkIdenticalApplyModalOpen] = useState(false);
    const [isBulkIdenticalApplying, setIsBulkIdenticalApplying] = useState(false);
    const [bulkIdenticalPickerGroupId, setBulkIdenticalPickerGroupId] = useState("");

    const bulkVerifyAbortRef = useRef(null);
    const bulkMetricsAbortRef = useRef(null);
    const bulkIdenticalAbortRef = useRef(null);
    const bulkIdenticalProgressPollRef = useRef(null);

    useEffect(() => {
        return () => {
            if (bulkVerifyAbortRef.current) {
                bulkVerifyAbortRef.current.abort();
                bulkVerifyAbortRef.current = null;
            }
            if (bulkMetricsAbortRef.current) {
                bulkMetricsAbortRef.current.abort();
                bulkMetricsAbortRef.current = null;
            }
            if (bulkIdenticalAbortRef.current) {
                bulkIdenticalAbortRef.current.abort();
                bulkIdenticalAbortRef.current = null;
            }
            if (bulkIdenticalProgressPollRef.current) {
                clearInterval(bulkIdenticalProgressPollRef.current);
                bulkIdenticalProgressPollRef.current = null;
            }
        };
    }, []);

    async function runBulkVerifyAllPoints(checkerVersionRaw = selectedBulkVerifyChecker) {
        if (bulkVerifyAbortRef.current) return;
        const normalizedChecker = normalizeCheckerForActor(checkerVersionRaw);
        const checkerVersion = enabledCheckers.has(normalizedChecker) ? normalizedChecker : defaultCheckerVersion;
        const controller = new AbortController();
        bulkVerifyAbortRef.current = controller;
        setIsBulkVerifyRunning(true);
        const targetPoints = points.filter((p) => {
            if (p.benchmark === "test") return false;
            if (bulkVerifyIncludeVerified) return true;
            return String(p.status || "").toLowerCase() !== "verified";
        });
        setBulkVerifyProgress({ done: 0, total: targetPoints.length });
        setAdminPanelError("");
        setBulkVerifyLogText("");
        setBulkVerifyCurrentFileName("");
        try {
            const rows = [];
            for (const point of targetPoints) {
                if (controller.signal.aborted) break;
                setBulkVerifyCurrentFileName(point.fileName || "");
                const row = await runAdminBulkVerifyPoint({
                    authKey: authKeyDraft,
                    checkerVersion,
                    pointId: point.id,
                    signal: controller.signal,
                    progressToken: uid(),
                });
                if (row) rows.push(row);
                appendTextLog(
                    setBulkVerifyLogText,
                    `file=${row?.fileName || point.fileName}; success=${row?.ok ? "true" : "false"}; reason=${row?.reason || "No result"}`
                );
                setBulkVerifyProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
            }
            if (controller.signal.aborted) {
                appendTextLog(setBulkVerifyLogText, "file=<bulk>; success=false; reason=Stopped by admin.");
                return;
            }

            const updates = rows
                .filter((row) => row.ok && (row.recommendedStatus === "verified" || row.recommendedStatus === "failed"))
                .map((row) => ({
                    pointId: row.pointId,
                    status: row.recommendedStatus,
                    benchmark: row.benchmark,
                    fileName: row.fileName,
                    checked: true,
                }));

            if (updates.length === 0) {
                window.alert("Bulk check completed. No status updates available.");
                return;
            }

            setBulkVerifyCandidates(updates);
            setIsBulkVerifyApplyModalOpen(true);
        } catch (error) {
            if (error?.name === "AbortError") {
                appendTextLog(setBulkVerifyLogText, "file=<bulk>; success=false; reason=Stopped by admin.");
                return;
            }
            setAdminPanelError(error?.message || "Failed to run bulk verification.");
        } finally {
            if (bulkVerifyAbortRef.current === controller) {
                bulkVerifyAbortRef.current = null;
            }
            setIsBulkVerifyRunning(false);
            setBulkVerifyProgress(null);
            setBulkVerifyCurrentFileName("");
        }
    }

    async function runBulkMetricsAudit() {
        if (bulkMetricsAbortRef.current) return;
        const controller = new AbortController();
        bulkMetricsAbortRef.current = controller;
        setIsBulkMetricsAuditRunning(true);
        const targetPoints = points.filter((p) => p.benchmark !== "test");
        setBulkMetricsAuditProgress({ done: 0, total: targetPoints.length });
        setAdminPanelError("");
        setBulkMetricsAuditLogText("");
        setBulkMetricsAuditCurrentFileName("");
        try {
            const mismatches = [];
            for (const point of targetPoints) {
                if (controller.signal.aborted) break;
                setBulkMetricsAuditCurrentFileName(point.fileName || "");
                const mismatch = await runAdminMetricsAuditPoint({
                    authKey: authKeyDraft,
                    pointId: point.id,
                    signal: controller.signal,
                    progressToken: uid(),
                });
                if (mismatch) mismatches.push(mismatch);
                appendTextLog(
                    setBulkMetricsAuditLogText,
                    mismatch
                        ? `file=${mismatch.fileName || point.fileName}; success=false; reason=${mismatch.reason || "Metric mismatch"}`
                        : `file=${point.fileName}; success=true; reason=Metrics matched.`
                );
                setBulkMetricsAuditProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
            }
            if (controller.signal.aborted) {
                appendTextLog(setBulkMetricsAuditLogText, "file=<bulk>; success=false; reason=Stopped by admin.");
                return;
            }
            if (mismatches.length === 0) {
                appendTextLog(setBulkMetricsAuditLogText, "file=<bulk>; success=true; reason=No mismatches.");
            }
        } catch (error) {
            if (error?.name === "AbortError") {
                appendTextLog(setBulkMetricsAuditLogText, "file=<bulk>; success=false; reason=Stopped by admin.");
                return;
            }
            setAdminPanelError(error?.message || "Failed to run metrics audit.");
        } finally {
            if (bulkMetricsAbortRef.current === controller) {
                bulkMetricsAbortRef.current = null;
            }
            setIsBulkMetricsAuditRunning(false);
            setBulkMetricsAuditProgress(null);
            setBulkMetricsAuditCurrentFileName("");
        }
    }

    async function runBulkIdenticalAudit() {
        if (bulkIdenticalAbortRef.current || isBulkIdenticalApplying) return;
        const controller = new AbortController();
        bulkIdenticalAbortRef.current = controller;
        const progressToken = uid();
        setIsBulkIdenticalAuditRunning(true);
        setAdminPanelError("");
        setBulkIdenticalAuditSummary(null);
        setBulkIdenticalAuditLogText("");
        setBulkIdenticalAuditProgress({ done: 0, total: 0 });
        setBulkIdenticalAuditCurrentFileName("");
        setBulkIdenticalGroups([]);
        try {
            if (bulkIdenticalProgressPollRef.current) clearInterval(bulkIdenticalProgressPollRef.current);
            bulkIdenticalProgressPollRef.current = setInterval(async () => {
                if (controller.signal.aborted) return;
                try {
                    const progress = await fetchVerifyPointProgress({ token: progressToken, signal: controller.signal });
                    setBulkIdenticalAuditProgress({
                        done: Number(progress?.doneCount || 0),
                        total: Number(progress?.totalCount || 0),
                    });
                    setBulkIdenticalAuditCurrentFileName(String(progress?.currentFileName || ""));
                } catch {
                    // Ignore transient polling errors.
                }
            }, 500);
            const payload = await runAdminIdenticalAudit({
                authKey: authKeyDraft,
                signal: controller.signal,
                progressToken,
            });
            const groups = (Array.isArray(payload?.groups) ? payload.groups : []).map((group) => ({
                ...group,
                checked: true,
                keepPointId: String(group?.points?.[0]?.id || ""),
            }));
            const summary = {
                scannedPoints: Number(payload?.scannedPoints || 0),
                failedPoints: Number(payload?.failedPoints || 0),
                groups: groups.length,
            };
            setBulkIdenticalAuditSummary(summary);
            setBulkIdenticalGroups(groups);
            const logLines = (Array.isArray(payload?.log) ? payload.log : []).map(
                (row) => `file=${row?.fileName || ""}; success=${row?.success ? "true" : "false"}; reason=${row?.reason || "No result"}`
            );
            if (groups.length > 0) {
                for (const group of groups) {
                    logLines.push(
                        `group=${group.groupId}; benchmark=${group.benchmark}; duplicates=${Array.isArray(group.points) ? group.points.length : 0}; hash=${String(group.hash || "").slice(0, 16)}`
                    );
                }
                setIsBulkIdenticalApplyModalOpen(true);
            }
            if (logLines.length > 0) {
                setBulkIdenticalAuditLogText(logLines.join("\n"));
            }
            if (groups.length === 0) {
                window.alert("Identical audit completed. No duplicate groups found.");
            }
        } catch (error) {
            if (error?.name === "AbortError") {
                appendTextLog(setBulkIdenticalAuditLogText, "file=<bulk>; success=false; reason=Stopped by admin.");
                return;
            }
            setAdminPanelError(error?.message || "Failed to audit identical points.");
        } finally {
            if (bulkIdenticalProgressPollRef.current) clearInterval(bulkIdenticalProgressPollRef.current);
            bulkIdenticalProgressPollRef.current = null;
            if (bulkIdenticalAbortRef.current === controller) {
                bulkIdenticalAbortRef.current = null;
            }
            setIsBulkIdenticalAuditRunning(false);
            setBulkIdenticalAuditProgress(null);
            setBulkIdenticalAuditCurrentFileName("");
        }
    }

    function setBulkIdenticalGroupChecked(groupId, checked) {
        setBulkIdenticalGroups((prev) =>
            prev.map((group) => (group.groupId === groupId ? { ...group, checked: Boolean(checked) } : group))
        );
    }

    function openBulkIdenticalGroupPicker(groupId) {
        setBulkIdenticalPickerGroupId(String(groupId || ""));
    }

    function closeBulkIdenticalGroupPicker() {
        setBulkIdenticalPickerGroupId("");
    }

    function setBulkIdenticalGroupKeepPoint(groupId, pointId) {
        const nextPointId = String(pointId || "").trim();
        setBulkIdenticalGroups((prev) =>
            prev.map((group) => {
                if (group.groupId !== groupId) return group;
                const points = Array.isArray(group.points) ? group.points : [];
                const exists = points.some((point) => String(point?.id || "") === nextPointId);
                return {
                    ...group,
                    keepPointId: exists ? nextPointId : String(points[0]?.id || ""),
                };
            })
        );
    }

    function selectAllBulkIdenticalGroups() {
        setBulkIdenticalGroups((prev) => prev.map((group) => ({ ...group, checked: true })));
    }

    function clearAllBulkIdenticalGroups() {
        setBulkIdenticalGroups((prev) => prev.map((group) => ({ ...group, checked: false })));
    }

    function closeBulkIdenticalApplyModal() {
        if (isBulkIdenticalApplying) return;
        setBulkIdenticalPickerGroupId("");
        setIsBulkIdenticalApplyModalOpen(false);
    }

    async function applySelectedBulkIdenticalGroups() {
        const resolutions = bulkIdenticalGroups
            .filter((group) => group.checked)
            .map((group) => {
                const points = Array.isArray(group.points) ? group.points : [];
                if (points.length <= 1) return null;
                const keepPointId = String(group.keepPointId || "").trim();
                const keepPoint = points.find((point) => String(point?.id || "") === keepPointId) || points[0];
                if (!keepPoint?.id) return null;
                const removePointIds = points
                    .filter((point) => String(point?.id || "") !== String(keepPoint.id))
                    .map((point) => String(point?.id || "").trim())
                    .filter(Boolean);
                if (removePointIds.length === 0) return null;
                return {
                    keepPointId: String(keepPoint.id),
                    removePointIds,
                };
            })
            .filter(Boolean);

        if (resolutions.length === 0) {
            setIsBulkIdenticalApplyModalOpen(false);
            return;
        }

        setIsBulkIdenticalApplying(true);
        setAdminPanelError("");
        try {
            const result = await applyAdminIdenticalResolutions({
                authKey: authKeyDraft,
                resolutions,
            });
            const freshPoints = await fetchPoints();
            setPoints(freshPoints);
            setIsBulkIdenticalApplyModalOpen(false);
            setBulkIdenticalPickerGroupId("");
            setBulkIdenticalGroups([]);
            window.alert(
                `Identical groups applied: ${Number(result?.appliedGroups || 0)}. Deleted points: ${Number(result?.deletedPoints || 0)}.`
            );
        } catch (error) {
            setAdminPanelError(error?.message || "Failed to apply identical points resolutions.");
        } finally {
            setIsBulkIdenticalApplying(false);
        }
    }

    function stopBulkVerifyAllPoints() {
        if (!bulkVerifyAbortRef.current) return;
        bulkVerifyAbortRef.current.abort();
        bulkVerifyAbortRef.current = null;
    }

    function stopBulkMetricsAudit() {
        if (!bulkMetricsAbortRef.current) return;
        bulkMetricsAbortRef.current.abort();
        bulkMetricsAbortRef.current = null;
    }

    function stopBulkIdenticalAudit() {
        if (!bulkIdenticalAbortRef.current) return;
        bulkIdenticalAbortRef.current.abort();
        bulkIdenticalAbortRef.current = null;
    }

    function setBulkVerifyCandidateChecked(pointId, checked) {
        setBulkVerifyCandidates((prev) => prev.map((row) => (row.pointId === pointId ? { ...row, checked } : row)));
    }

    function selectAllBulkVerifyCandidates() {
        setBulkVerifyCandidates((prev) => prev.map((row) => ({ ...row, checked: true })));
    }

    function clearAllBulkVerifyCandidates() {
        setBulkVerifyCandidates((prev) => prev.map((row) => ({ ...row, checked: false })));
    }

    function closeBulkVerifyApplyModal() {
        setIsBulkVerifyApplyModalOpen(false);
    }

    async function applySelectedBulkVerifyCandidates() {
        const updates = bulkVerifyCandidates
            .filter((row) => row.checked)
            .map((row) => ({ pointId: row.pointId, status: row.status }));
        if (updates.length === 0) {
            setIsBulkVerifyApplyModalOpen(false);
            return;
        }

        setIsBulkVerifyRunning(true);
        setAdminPanelError("");
        try {
            const normalizedChecker = normalizeCheckerForActor(selectedBulkVerifyChecker);
            const checkerVersion = enabledCheckers.has(normalizedChecker)
                ? normalizedChecker
                : defaultCheckerVersion;
            await applyAdminPointStatuses({
                authKey: authKeyDraft,
                updates,
                checkerVersion,
            });
            const freshPoints = await fetchPoints();
            setPoints(freshPoints);
            setIsBulkVerifyApplyModalOpen(false);
            setBulkVerifyCandidates([]);
            window.alert(`Applied statuses for ${updates.length} points.`);
        } catch (error) {
            setAdminPanelError(error?.message || "Failed to apply statuses.");
        } finally {
            setIsBulkVerifyRunning(false);
        }
    }

    return {
        isBulkVerifyRunning,
        selectedBulkVerifyChecker,
        setSelectedBulkVerifyChecker,
        bulkVerifyIncludeVerified,
        setBulkVerifyIncludeVerified,
        bulkVerifyCurrentFileName,
        bulkVerifyLogText,
        isBulkMetricsAuditRunning,
        bulkMetricsAuditCurrentFileName,
        bulkMetricsAuditLogText,
        bulkVerifyProgress,
        bulkMetricsAuditProgress,
        bulkVerifyCandidates,
        isBulkVerifyApplyModalOpen,
        isBulkIdenticalAuditRunning,
        bulkIdenticalAuditSummary,
        bulkIdenticalAuditLogText,
        bulkIdenticalAuditProgress,
        bulkIdenticalAuditCurrentFileName,
        bulkIdenticalGroups,
        isBulkIdenticalApplyModalOpen,
        isBulkIdenticalApplying,
        bulkIdenticalPickerGroupId,
        runBulkVerifyAllPoints,
        runBulkMetricsAudit,
        runBulkIdenticalAudit,
        setBulkIdenticalGroupChecked,
        openBulkIdenticalGroupPicker,
        closeBulkIdenticalGroupPicker,
        setBulkIdenticalGroupKeepPoint,
        selectAllBulkIdenticalGroups,
        clearAllBulkIdenticalGroups,
        closeBulkIdenticalApplyModal,
        applySelectedBulkIdenticalGroups,
        stopBulkVerifyAllPoints,
        stopBulkMetricsAudit,
        stopBulkIdenticalAudit,
        setBulkVerifyCandidateChecked,
        selectAllBulkVerifyCandidates,
        clearAllBulkVerifyCandidates,
        closeBulkVerifyApplyModal,
        applySelectedBulkVerifyCandidates,
    };
}

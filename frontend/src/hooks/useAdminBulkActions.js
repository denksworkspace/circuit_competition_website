import { useEffect, useRef, useState } from "react";
import {
    applyAdminIdenticalResolutions,
    runAdminBulkVerify,
    applyAdminPointStatuses,
    fetchPoints,
    fetchVerifyPointProgress,
    runAdminIdenticalAudit,
    runAdminMetricsAudit,
} from "../services/apiClient.js";
import { uid } from "../utils/pointUtils.js";
import { appendTextLog } from "../utils/uploadFlowUtils.js";

export function useAdminBulkActions({
    authKeyDraft,
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
    const [isBulkVerifyApplying, setIsBulkVerifyApplying] = useState(false);
    const [bulkVerifyApplyProgress, setBulkVerifyApplyProgress] = useState(null);
    const [isBulkIdenticalAuditRunning, setIsBulkIdenticalAuditRunning] = useState(false);
    const [bulkIdenticalAuditSummary, setBulkIdenticalAuditSummary] = useState(null);
    const [bulkIdenticalAuditLogText, setBulkIdenticalAuditLogText] = useState("");
    const [bulkIdenticalAuditProgress, setBulkIdenticalAuditProgress] = useState(null);
    const [bulkIdenticalAuditCurrentFileName, setBulkIdenticalAuditCurrentFileName] = useState("");
    const [bulkIdenticalGroups, setBulkIdenticalGroups] = useState(() => []);
    const [isBulkIdenticalApplyModalOpen, setIsBulkIdenticalApplyModalOpen] = useState(false);
    const [isBulkIdenticalApplying, setIsBulkIdenticalApplying] = useState(false);
    const [bulkIdenticalApplyProgress, setBulkIdenticalApplyProgress] = useState(null);
    const [bulkIdenticalPickerGroupId, setBulkIdenticalPickerGroupId] = useState("");

    const bulkVerifyAbortRef = useRef(null);
    const bulkMetricsAbortRef = useRef(null);
    const bulkIdenticalAbortRef = useRef(null);
    const bulkVerifyProgressPollRef = useRef(null);
    const bulkMetricsProgressPollRef = useRef(null);
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
            if (bulkVerifyProgressPollRef.current) {
                clearInterval(bulkVerifyProgressPollRef.current);
                bulkVerifyProgressPollRef.current = null;
            }
            if (bulkMetricsProgressPollRef.current) {
                clearInterval(bulkMetricsProgressPollRef.current);
                bulkMetricsProgressPollRef.current = null;
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
        setAdminPanelError("");
        setBulkVerifyLogText("");
        setBulkVerifyCurrentFileName("");
        try {
            const progressToken = uid();
            setBulkVerifyProgress({ done: 0, total: 0 });
            if (bulkVerifyProgressPollRef.current) clearInterval(bulkVerifyProgressPollRef.current);
            bulkVerifyProgressPollRef.current = setInterval(async () => {
                if (controller.signal.aborted) return;
                try {
                    const progress = await fetchVerifyPointProgress({ token: progressToken, signal: controller.signal });
                    setBulkVerifyProgress({
                        done: Number(progress?.doneCount || 0),
                        total: Number(progress?.totalCount || 0),
                    });
                    setBulkVerifyCurrentFileName(String(progress?.currentFileName || ""));
                } catch {
                    // Ignore transient polling errors.
                }
            }, 500);
            const payload = await runAdminBulkVerify({
                authKey: authKeyDraft,
                checkerVersion,
                includeVerified: bulkVerifyIncludeVerified,
                includeDeleted: true,
                signal: controller.signal,
                progressToken,
            });
            const rows = Array.isArray(payload?.log) ? payload.log : [];
            setBulkVerifyProgress((prev) => ({
                done: rows.length,
                total: Math.max(Number(prev?.total || 0), rows.length),
            }));

            for (const row of rows) {
                appendTextLog(
                    setBulkVerifyLogText,
                    `file=${row?.fileName || ""}; success=${row?.ok ? "true" : "false"}; reason=${row?.reason || "No result"}`
                );
            }
            if (rows.length === 0) {
                appendTextLog(setBulkVerifyLogText, "file=<bulk>; success=true; reason=No points to verify with current filter.");
                window.alert("No points to verify with current filter.");
                return;
            }

            const updates = rows
                .filter((row) => {
                    if (!row?.ok) return false;
                    if (row.recommendedStatus !== "verified" && row.recommendedStatus !== "failed") return false;
                    return String(row?.sourceStatus || "").trim().toLowerCase() !== "deleted";
                })
                .map((row) => ({
                    pointId: row.pointId,
                    status: row.recommendedStatus,
                    benchmark: row.benchmark,
                    fileName: row.fileName,
                    verdict: row.recommendedStatus,
                    reason: String(row.reason || ""),
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
            if (bulkVerifyProgressPollRef.current) clearInterval(bulkVerifyProgressPollRef.current);
            bulkVerifyProgressPollRef.current = null;
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
        setBulkMetricsAuditProgress({ done: 0, total: 0 });
        setAdminPanelError("");
        setBulkMetricsAuditLogText("");
        setBulkMetricsAuditCurrentFileName("");
        try {
            const progressToken = uid();
            if (bulkMetricsProgressPollRef.current) clearInterval(bulkMetricsProgressPollRef.current);
            bulkMetricsProgressPollRef.current = setInterval(async () => {
                if (controller.signal.aborted) return;
                try {
                    const progress = await fetchVerifyPointProgress({ token: progressToken, signal: controller.signal });
                    setBulkMetricsAuditProgress({
                        done: Number(progress?.doneCount || 0),
                        total: Number(progress?.totalCount || 0),
                    });
                    setBulkMetricsAuditCurrentFileName(String(progress?.currentFileName || ""));
                } catch {
                    // Ignore transient polling errors.
                }
            }, 500);
            const payload = await runAdminMetricsAudit({
                authKey: authKeyDraft,
                signal: controller.signal,
                progressToken,
            });
            const mismatches = Array.isArray(payload?.mismatches) ? payload.mismatches : [];
            const scannedPoints = Number(payload?.scannedPoints || 0);
            setBulkMetricsAuditProgress({ done: scannedPoints, total: scannedPoints });

            if (mismatches.length > 0) {
                for (const mismatch of mismatches) {
                    appendTextLog(
                        setBulkMetricsAuditLogText,
                        `file=${mismatch?.fileName || ""}; success=false; reason=${mismatch?.reason || "Metric mismatch"}`
                    );
                }
            } else {
                appendTextLog(setBulkMetricsAuditLogText, "file=<bulk>; success=true; reason=No mismatches.");
            }
        } catch (error) {
            if (error?.name === "AbortError") {
                appendTextLog(setBulkMetricsAuditLogText, "file=<bulk>; success=false; reason=Stopped by admin.");
                return;
            }
            setAdminPanelError(error?.message || "Failed to run metrics audit.");
        } finally {
            if (bulkMetricsProgressPollRef.current) clearInterval(bulkMetricsProgressPollRef.current);
            bulkMetricsProgressPollRef.current = null;
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
        setBulkIdenticalApplyProgress(null);
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
        setBulkIdenticalApplyProgress({ processed: 0, total: resolutions.length });
        setAdminPanelError("");
        try {
            let appliedGroups = 0;
            let deletedPoints = 0;
            for (let index = 0; index < resolutions.length; index += 1) {
                const resolution = resolutions[index];
                const result = await applyAdminIdenticalResolutions({
                    authKey: authKeyDraft,
                    resolutions: [resolution],
                });
                appliedGroups += Number(result?.appliedGroups || 0);
                deletedPoints += Number(result?.deletedPoints || 0);
                setBulkIdenticalApplyProgress((prev) => (prev ? { ...prev, processed: index + 1 } : prev));
            }
            const freshPoints = await fetchPoints();
            setPoints(freshPoints);
            setIsBulkIdenticalApplyModalOpen(false);
            setBulkIdenticalPickerGroupId("");
            setBulkIdenticalGroups([]);
            window.alert(
                `Identical groups applied: ${appliedGroups}. Deleted points: ${deletedPoints}.`
            );
        } catch (error) {
            setAdminPanelError(error?.message || "Failed to apply identical points resolutions.");
        } finally {
            setIsBulkIdenticalApplying(false);
            setBulkIdenticalApplyProgress(null);
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
        if (isBulkVerifyApplying) return;
        setIsBulkVerifyApplyModalOpen(false);
        setBulkVerifyApplyProgress(null);
    }

    async function applySelectedBulkVerifyCandidates() {
        const updates = bulkVerifyCandidates
            .filter((row) => row.checked)
            .map((row) => ({ pointId: row.pointId, status: row.status }));
        if (updates.length === 0) {
            setIsBulkVerifyApplyModalOpen(false);
            return;
        }

        setIsBulkVerifyApplying(true);
        setBulkVerifyApplyProgress({ processed: 0, total: updates.length });
        setAdminPanelError("");
        try {
            const normalizedChecker = normalizeCheckerForActor(selectedBulkVerifyChecker);
            const checkerVersion = enabledCheckers.has(normalizedChecker)
                ? normalizedChecker
                : defaultCheckerVersion;
            const errors = [];
            for (let index = 0; index < updates.length; index += 1) {
                const update = updates[index];
                try {
                    await applyAdminPointStatuses({
                        authKey: authKeyDraft,
                        updates: [update],
                        checkerVersion,
                    });
                } catch (error) {
                    errors.push(String(error?.message || `Failed to apply status for point ${update.pointId}.`));
                } finally {
                    setBulkVerifyApplyProgress((prev) => (prev ? { ...prev, processed: index + 1 } : prev));
                }
            }
            const freshPoints = await fetchPoints();
            setPoints(freshPoints);
            setIsBulkVerifyApplyModalOpen(false);
            setBulkVerifyCandidates([]);
            if (errors.length > 0) {
                setAdminPanelError(errors[0]);
            } else {
                window.alert(`Applied statuses for ${updates.length} points.`);
            }
        } catch (error) {
            setAdminPanelError(error?.message || "Failed to apply statuses.");
        } finally {
            setIsBulkVerifyApplying(false);
            setBulkVerifyApplyProgress(null);
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
        isBulkVerifyApplying,
        bulkVerifyApplyProgress,
        isBulkIdenticalAuditRunning,
        bulkIdenticalAuditSummary,
        bulkIdenticalAuditLogText,
        bulkIdenticalAuditProgress,
        bulkIdenticalAuditCurrentFileName,
        bulkIdenticalGroups,
        isBulkIdenticalApplyModalOpen,
        isBulkIdenticalApplying,
        bulkIdenticalApplyProgress,
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

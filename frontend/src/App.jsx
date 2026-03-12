// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import {
    DEFAULT_TEST_COMMAND_COUNT,
    DELETE_PREVIEW_LIMIT,
    DIVISIONS,
    MAX_DESCRIPTION_LEN,
    MAX_MULTI_FILE_BATCH_COUNT,
    MAX_VALUE,
    ROLE_ADMIN,
    STATUS_LIST,
} from "./constants/appConstants.js";
import { LoginPage } from "./components/app/LoginPage.jsx";
import { ChartSection } from "./components/app/ChartSection.jsx";
import { SentPointsSection } from "./components/app/SentPointsSection.jsx";
import { FiltersSection } from "./components/app/FiltersSection.jsx";
import { AddPointSection } from "./components/app/AddPointSection.jsx";
import { AdminSettingsSection } from "./components/app/AdminSettingsSection.jsx";
import { FindPointsSection } from "./components/app/FindPointsSection.jsx";
import { PointActionModal } from "./components/app/PointActionModal.jsx";
import { ManualPointApplyModal } from "./components/app/ManualPointApplyModal.jsx";
import { MaintenanceScreen } from "./components/app/MaintenanceScreen.jsx";
import {
    buildAxis,
    computeParetoFrontOriginal,
    computePlottedPoint,
    getRoleLabel,
    uid,
} from "./utils/pointUtils.js";
import { clamp, formatIntNoGrouping, parsePosIntCapped } from "./utils/numberUtils.js";
import { chooseAreaSmartFromParetoFront, randInt, randomChoice } from "./utils/testPointUtils.js";
import { useAppAuth } from "./hooks/useAppAuth.js";
import { useAdminLogs } from "./hooks/useAdminLogs.js";
import { useBenchmarkMenu } from "./hooks/useBenchmarkMenu.js";
import { useAdminBulkActions } from "./hooks/useAdminBulkActions.js";
import { useAdminExportFlow } from "./hooks/useAdminExportFlow.js";
import { useBenchUploadFlow } from "./hooks/useBenchUploadFlow.js";
import { usePointActions } from "./hooks/usePointActions.js";
import { usePointTesting } from "./hooks/usePointTesting.js";
import { useAdminUserSettings } from "./hooks/useAdminUserSettings.js";
import { useTruthUploadFlow } from "./hooks/useTruthUploadFlow.js";
import { downloadTextAsFile } from "./utils/fileDownloadUtils.js";
import { fetchMaintenanceStatus } from "./services/apiClient.js";

const CHECKER_ABC = "ABC";
const CHECKER_ABC_FAST_HEX = "ABC_FAST_HEX";
const DEFAULT_CHECKER_VERSION = CHECKER_ABC;
const ENABLED_CHECKERS = new Set([CHECKER_ABC, CHECKER_ABC_FAST_HEX]);

export default function App() {
    const isLocalRuntime = typeof window !== "undefined"
        && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
    function bytesToGb(bytes) {
        const value = Number(bytes);
        if (!Number.isFinite(value) || value < 0) return 0;
        return value / (1024 ** 3);
    }

    function formatGb(bytes) {
        return bytesToGb(bytes).toFixed(2);
    }

    const [points, setPoints] = useState(() => []);
    const [lastAddedId, setLastAddedId] = useState(null);
    const [commands, setCommands] = useState(() => []);
    const commandByName = useMemo(() => new Map(commands.map((c) => [c.name, c])), [commands]);
    const {
        authKeyDraft,
        setAuthKeyDraft,
        currentCommand,
        authError,
        isAuthChecking,
        isBootstrapping,
        tryLogin,
        logout,
    } = useAppAuth({ setPoints, setCommands });

    // Command filter (Codeforces-like tag chips). If none selected -> show all.
    const [commandQuery, setCommandQuery] = useState("");
    const [selectedCommands, setSelectedCommands] = useState(() => []);
    const selectedCommandSet = useMemo(() => new Set(selectedCommands), [selectedCommands]);
    const { benchmarkMenuOpen, setBenchmarkMenuOpen, benchmarkMenuRef } = useBenchmarkMenu();

    function addSelectedCommand(name) {
        setSelectedCommands((prev) => (prev.includes(name) ? prev : [...prev, name]));
    }

    function removeSelectedCommand(name) {
        setSelectedCommands((prev) => prev.filter((x) => x !== name));
    }

    const [navigateNotice, setNavigateNotice] = useState("");
    const [maintenanceStatus, setMaintenanceStatus] = useState(() => ({
        enabled: false,
        activeForUser: false,
        bypass: false,
        message: "",
    }));
    const maintenancePollRef = useRef(null);

    const maxSingleUploadBytes = Math.max(0, Number(currentCommand?.maxSingleUploadBytes || 0));
    const totalUploadQuotaBytes = Math.max(0, Number(currentCommand?.totalUploadQuotaBytes || 0));
    const uploadedBytesTotal = Math.max(0, Number(currentCommand?.uploadedBytesTotal || 0));
    const remainingUploadBytes = Math.max(0, totalUploadQuotaBytes - uploadedBytesTotal);
    const maxMultiFileBatchCount = Math.max(1, Number(currentCommand?.maxMultiFileBatchCount || MAX_MULTI_FILE_BATCH_COUNT));
    const verifyTimeoutQuotaSeconds = Math.max(1, Number(currentCommand?.abcVerifyTimeoutSeconds || 60));
    const metricsTimeoutQuotaSeconds = Math.max(1, Number(currentCommand?.abcMetricsTimeoutSeconds || 60));
    const [isAdminQuotaSettingsOpen, setIsAdminQuotaSettingsOpen] = useState(false);
    const isAdmin = currentCommand?.role === ROLE_ADMIN;
    const canUseFastHex = isAdmin;
    const {
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
    } = useAdminExportFlow({ authKeyDraft });
    const {
        adminLogCommandQuery,
        setAdminLogCommandQuery,
        adminLogActionQuery,
        setAdminLogActionQuery,
        selectedAdminLogActions,
        addSelectedAdminLogAction,
        removeSelectedAdminLogAction,
        selectedAdminLogActionSet,
        availableAdminLogActions,
        filteredAdminLogs,
        adminLogsPreview,
        adminLogsHasMore,
        refreshAdminLogs,
    } = useAdminLogs({ isAdmin, authKeyDraft, commands });
    const {
        adminUserIdDraft,
        setAdminUserIdDraft,
        adminPanelError,
        setAdminPanelError,
        adminUser,
        adminSingleGbDraft,
        setAdminSingleGbDraft,
        adminTotalGbDraft,
        setAdminTotalGbDraft,
        adminBatchCountDraft,
        setAdminBatchCountDraft,
        adminVerifyTleSecondsDraft,
        setAdminVerifyTleSecondsDraft,
        adminMetricsTleSecondsDraft,
        setAdminMetricsTleSecondsDraft,
        isMaintenanceModeEnabled,
        setIsMaintenanceModeEnabled,
        maintenanceMessageDraft,
        setMaintenanceMessageDraft,
        maintenanceWhitelistDraft,
        setMaintenanceWhitelistDraft,
        isAdminLoading,
        isAdminSaving,
        loadAdminUser,
        saveAdminUserSettings,
        saveMaintenanceSettings,
    } = useAdminUserSettings({
        isAdmin,
        authKeyDraft,
        formatGb,
        refreshAdminLogs,
    });
    const {
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
    } = useAdminBulkActions({
        authKeyDraft,
        points,
        setPoints,
        setAdminPanelError,
        normalizeCheckerForActor,
        enabledCheckers: ENABLED_CHECKERS,
        defaultCheckerVersion: DEFAULT_CHECKER_VERSION,
    });
    const {
        actionPoint,
        getPointDownloadUrl,
        canDeletePoint,
        canTestPoint,
        downloadCircuit,
        openPointActionModal,
        closePointActionModal,
        confirmAndDeletePoint,
    } = usePointActions({
        points,
        setPoints,
        lastAddedId,
        setLastAddedId,
        currentCommand,
        authKeyDraft,
    });
    const {
        selectedTestChecker,
        setSelectedTestChecker,
        testingPointId,
        testingPointLabel,
        onTestPoint,
    } = usePointTesting({
        authKeyDraft,
        currentCommand,
        isAdmin,
        verifyTimeoutQuotaSeconds,
        normalizeCheckerForActor,
        enabledCheckers: ENABLED_CHECKERS,
        defaultCheckerVersion: DEFAULT_CHECKER_VERSION,
        setPoints,
    });
    const {
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
    } = useTruthUploadFlow({
        authKeyDraft,
        maxSingleUploadBytes,
        remainingUploadBytes,
        formatGb,
    });

    function normalizeCheckerForActor(checkerRaw) {
        const checker = String(checkerRaw || "").trim();
        if (checker === CHECKER_ABC_FAST_HEX && !canUseFastHex) return CHECKER_ABC;
        return checker;
    }

    // Filters (start in "test")
    const [benchmarkFilter, setBenchmarkFilter] = useState("test"); // "test" | numeric string
    const [colorMode, setColorMode] = useState("status");
    const [statusFilter, setStatusFilter] = useState({
        "non-verified": true,
        verified: true,
        failed: true,
    });
    const {
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
        showManualApplyButton,
        openManualApplyModal,
        onFileChange,
        requestStopUpload,
        addPointFromFile,
        uploadDisabledReason,
        canAdd,
        setManualApplyChecked,
        applyManualRows,
        closeManualApplyModal,
    } = useBenchUploadFlow({
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
        enabledCheckers: ENABLED_CHECKERS,
    });

    const [deletePrefix, setDeletePrefix] = useState("");

    // View rectangle inputs
    const [delayMax, setDelayMax] = useState(50);
    const [areaMax, setAreaMax] = useState(1000);
    const [delayMaxDraft, setDelayMaxDraft] = useState("50");
    const [areaMaxDraft, setAreaMaxDraft] = useState("1000");

    const delayAxis = useMemo(() => buildAxis(delayMax, DIVISIONS, MAX_VALUE), [delayMax]);
    const areaAxis = useMemo(() => buildAxis(areaMax, DIVISIONS, MAX_VALUE), [areaMax]);
    const delayOverflowLane = delayAxis.overflow;
    const areaOverflowLane = areaAxis.overflow;
    const availableBenchmarks = useMemo(() => {
        const numeric = new Set();
        for (const p of points) {
            if (p.benchmark !== "test") numeric.add(Number(p.benchmark));
        }
        return Array.from(numeric).sort((a, b) => a - b);
    }, [points]);

    // Commands shown in the "Users" picker:
    // show ONLY senders that have at least one point in the currently selected benchmark.
    // (If benchmark is "test" -> only test points; otherwise only that numeric benchmark.)
    const availableCommandNames = useMemo(() => {
        const set = new Set();
        for (const p of points) {
            if (benchmarkFilter === "test") {
                if (p.benchmark === "test") set.add(p.sender);
            } else {
                if (String(p.benchmark) === String(benchmarkFilter)) set.add(p.sender);
            }
        }
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [points, benchmarkFilter]);



    // Visible points = benchmark filter + status filter (NOT dependent on view rectangle)
    const visiblePoints = useMemo(() => {
        return points.filter((p) => {
            if (benchmarkFilter === "test") {
                if (p.benchmark !== "test") return false;
            } else {
                if (String(p.benchmark) !== String(benchmarkFilter)) return false;
            }
            if (!statusFilter[p.status]) return false;
            if (selectedCommands.length > 0 && !selectedCommandSet.has(p.sender)) return false;
            return true;
        });
    }, [points, benchmarkFilter, statusFilter, selectedCommands, selectedCommandSet]);

    // Pareto computed ONLY from visible points (does NOT depend on view rectangle)
    const paretoBase = useMemo(() => {
        return computeParetoFrontOriginal(visiblePoints);
    }, [visiblePoints]);

    const fitViewToPoints = useCallback((sourcePoints) => {
        if (!Array.isArray(sourcePoints) || sourcePoints.length === 0) return false;
        let maxDelay = 1;
        let maxArea = 1;
        for (const p of sourcePoints) {
            const d = Number(p?.delay);
            const a = Number(p?.area);
            if (Number.isFinite(d)) maxDelay = Math.max(maxDelay, Math.min(MAX_VALUE, Math.trunc(d)));
            if (Number.isFinite(a)) maxArea = Math.max(maxArea, Math.min(MAX_VALUE, Math.trunc(a)));
        }
        setDelayMax(maxDelay);
        setAreaMax(maxArea);
        setDelayMaxDraft(String(maxDelay));
        setAreaMaxDraft(String(maxArea));
        return true;
    }, []);

    const fitViewToPareto = useCallback(() => {
        fitViewToPoints(paretoBase);
    }, [fitViewToPoints, paretoBase]);

    const fitViewToAllVisiblePoints = useCallback(() => {
        fitViewToPoints(visiblePoints);
    }, [fitViewToPoints, visiblePoints]);

    const onSelectBenchmark = useCallback((benchmark) => {
        const nextBenchmark = String(benchmark);
        setBenchmarkFilter(nextBenchmark);
        setBenchmarkMenuOpen(false);

        const nextVisible = points.filter((p) => {
            if (nextBenchmark === "test") {
                if (p.benchmark !== "test") return false;
            } else {
                if (String(p.benchmark) !== nextBenchmark) return false;
            }
            if (!statusFilter[p.status]) return false;
            if (selectedCommands.length > 0 && !selectedCommandSet.has(p.sender)) return false;
            return true;
        });

        const nextPareto = computeParetoFrontOriginal(nextVisible);
        if (!fitViewToPoints(nextPareto)) {
            fitViewToPoints(nextVisible);
        }
    }, [fitViewToPoints, points, selectedCommandSet, selectedCommands.length, setBenchmarkMenuOpen, statusFilter]);

    // Pareto DISPLAY points: show only the segment inside the current rectangle
    // (no recomputation of membership, only cropping for display)
    const paretoDisplay = useMemo(() => {
        const inBounds = paretoBase.filter((p) => p.delay <= delayMax && p.area <= areaMax);
        // sort for line
        return [...inBounds].sort((a, b) => {
            if (a.delay !== b.delay) return a.delay - b.delay;
            return a.area - b.area;
        });
    }, [paretoBase, delayMax, areaMax]);

    // Display mapping for all visible points (includes overflow lane mapping)
    const plottedPoints = useMemo(
        () =>
            visiblePoints.map((p) =>
                computePlottedPoint(
                    p,
                    delayMax,
                    areaMax,
                    delayAxis.step,
                    areaAxis.step,
                    delayOverflowLane,
                    areaOverflowLane
                )
            ),
        [visiblePoints, delayMax, areaMax, delayAxis.step, areaAxis.step, delayOverflowLane, areaOverflowLane]
    );
    const pointsRenderKey = useMemo(
        () =>
            [
                delayMax,
                areaMax,
                colorMode,
                benchmarkFilter,
                statusFilter["non-verified"] ? 1 : 0,
                statusFilter.verified ? 1 : 0,
                statusFilter.failed ? 1 : 0,
                selectedCommands.join("|"),
            ].join(":"),
        [delayMax, areaMax, colorMode, benchmarkFilter, statusFilter, selectedCommands]
    );

    const areaAxisWidth = useMemo(() => {
        const labelA = `>${formatIntNoGrouping(areaMax)}`;
        const labelB = formatIntNoGrouping(areaOverflowLane);
        const longest = Math.max(labelA.length, labelB.length);
        return clamp(longest * 8 + 18, 52, 160);
    }, [areaMax, areaOverflowLane]);

    const myPoints = useMemo(() => {
        if (!currentCommand) return [];
        return points.filter((p) => p.sender === currentCommand.name);
    }, [points, currentCommand]);

    function clearAllTestNoConfirm() {
        setPoints((prev) => prev.filter((p) => p.benchmark !== "test"));
        if (benchmarkFilter === "test") setLastAddedId(null);
    }

    function generateRandomTestPoints() {
        const count = randInt(10, 100);
        const next = [];

        // Track delays used in THIS generation
        const usedDelays = new Set();

        // We maintain a running set of generated points,
        // and recompute Pareto front each time we need "nearest front neighbors".
        const generatedSoFar = [];

        let newestId = null;

        for (let i = 1; i <= count; i++) {
            const delay = randInt(10, 50);

            const isNewDelay = !usedDelays.has(delay);

            let area;
            if (isNewDelay) {
                const frontNow = computeParetoFrontOriginal(generatedSoFar);
                area = chooseAreaSmartFromParetoFront(frontNow, delay);
                usedDelays.add(delay);
            } else {
                // if delay already exists, choose area purely random (as you said earlier)
                area = randInt(100, 1000);
            }

            const testCommandCount = Math.max(1, commands.length || DEFAULT_TEST_COMMAND_COUNT);
            const cmdNum = randInt(1, testCommandCount);
            const sender = `test_command${cmdNum}`;
            const status = randomChoice(STATUS_LIST);
            const description = `point${i}`;
            const fileName = `test_${delay}_${area}_points${i}_test_command${cmdNum}.bench`;

            const id = uid();
            newestId = id;

            const p = {
                id,
                benchmark: "test",
                delay,
                area,
                description,
                sender,
                status,
                fileName,
            };

            next.push(p);
            generatedSoFar.push(p);
        }

        // Replace all existing test points
        setPoints((prev) => {
            const nonTest = prev.filter((p) => p.benchmark !== "test");
            return [...next, ...nonTest];
        });

        setLastAddedId(newestId);
    }

    function applyView(e) {
        e.preventDefault();
        const dMax = parsePosIntCapped(delayMaxDraft, MAX_VALUE);
        const aMax = parsePosIntCapped(areaMaxDraft, MAX_VALUE);
        if (dMax === null || aMax === null) return;
        setDelayMax(dMax);
        setAreaMax(aMax);
    }

    function downloadBenchmarksExcel() {
        const rows = points.filter((p) => p.benchmark !== "test");
        const maxDelay = rows.reduce((max, p) => {
            const delay = Number(p.delay);
            if (!Number.isFinite(delay)) return max;
            return Math.max(max, Math.trunc(delay));
        }, 0);

        const minAreaByBenchDelay = new Map();
        for (const p of rows) {
            const bench = Number(p.benchmark);
            const delay = Math.trunc(Number(p.delay));
            const area = Number(p.area);
            if (!Number.isInteger(bench) || bench < 200 || bench > 299) continue;
            if (!Number.isInteger(delay) || delay < 1) continue;
            if (!Number.isFinite(area)) continue;

            const key = `${bench}:${delay}`;
            const prev = minAreaByBenchDelay.get(key);
            if (prev === undefined || area < prev) {
                minAreaByBenchDelay.set(key, area);
            }
        }

        const header = ["bench/delay"];
        for (let delay = 1; delay <= maxDelay; delay += 1) {
            header.push(String(delay));
        }
        header.push("pareto_points");

        const lines = [header];
        for (let bench = 200; bench <= 299; bench += 1) {
            const row = [String(bench)];
            for (let delay = 1; delay <= maxDelay; delay += 1) {
                const value = minAreaByBenchDelay.get(`${bench}:${delay}`);
                row.push(value === undefined ? "" : String(value));
            }

            const benchPoints = rows
                .filter((p) => Number(p.benchmark) === bench)
                .map((p) => ({
                    delay: Number(p.delay),
                    area: Number(p.area),
                }))
                .filter((p) => Number.isFinite(p.delay) && Number.isFinite(p.area));
            const paretoPoints = computeParetoFrontOriginal(benchPoints)
                .map((p) => `(${Math.trunc(p.delay)}, ${Math.trunc(p.area)})`)
                .join(", ");
            row.push(paretoPoints);

            lines.push(row);
        }

        const csv = lines
            .map((row) =>
                row
                    .map((cell) => {
                        const s = String(cell ?? "");
                        if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
                        return s;
                    })
                    .join(",")
            )
            .join("\n");

        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "benchmarks.csv";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    const delayViewValid =
        delayMaxDraft === "" || parsePosIntCapped(delayMaxDraft, MAX_VALUE) !== null;
    const areaViewValid =
        areaMaxDraft === "" || parsePosIntCapped(areaMaxDraft, MAX_VALUE) !== null;

    const canApplyView =
        parsePosIntCapped(delayMaxDraft, MAX_VALUE) !== null &&
        parsePosIntCapped(areaMaxDraft, MAX_VALUE) !== null;

    useEffect(() => {
        const suggestedChecker = String(verifyTimeoutQuotaSeconds);
        setCheckerTleSecondsDraft((prev) => {
            const parsed = Number(prev);
            if (Number.isFinite(parsed) && parsed >= 1 && parsed <= verifyTimeoutQuotaSeconds) return prev;
            return suggestedChecker;
        });
    }, [verifyTimeoutQuotaSeconds, setCheckerTleSecondsDraft]);

    useEffect(() => {
        const suggestedParser = String(metricsTimeoutQuotaSeconds);
        setParserTleSecondsDraft((prev) => {
            const parsed = Number(prev);
            if (Number.isFinite(parsed) && parsed >= 1 && parsed <= metricsTimeoutQuotaSeconds) return prev;
            return suggestedParser;
        });
    }, [metricsTimeoutQuotaSeconds, setParserTleSecondsDraft]);

    useEffect(() => {
        if (canUseFastHex) return;
        setSelectedChecker((prev) => (prev === CHECKER_ABC_FAST_HEX ? CHECKER_ABC : prev));
        setSelectedTestChecker((prev) => (prev === CHECKER_ABC_FAST_HEX ? CHECKER_ABC : prev));
        setSelectedBulkVerifyChecker((prev) => (prev === CHECKER_ABC_FAST_HEX ? CHECKER_ABC : prev));
    }, [canUseFastHex, setSelectedBulkVerifyChecker, setSelectedChecker, setSelectedTestChecker]);

    function downloadUploadLog() {
        if (!uploadLogText) return;
        downloadTextAsFile(uploadLogText, `upload-log-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`);
    }

    function downloadTruthUploadLog() {
        if (!truthUploadLogText) return;
        downloadTextAsFile(truthUploadLogText, `truth-upload-log-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`);
    }

    function downloadBulkVerifyLog() {
        if (!bulkVerifyLogText) return;
        downloadTextAsFile(bulkVerifyLogText, `bulk-check-log-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`);
    }

    function downloadBulkMetricsAuditLog() {
        if (!bulkMetricsAuditLogText) return;
        downloadTextAsFile(bulkMetricsAuditLogText, `bulk-metrics-audit-log-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`);
    }

    function downloadBulkIdenticalAuditLog() {
        if (!bulkIdenticalAuditLogText) return;
        downloadTextAsFile(bulkIdenticalAuditLogText, `bulk-identical-audit-log-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`);
    }

    function formatDelayTick(value) {
        const v = Number(value);
        if (!Number.isFinite(v)) return "";
        if (v === delayOverflowLane) return `>${formatIntNoGrouping(delayMax)}`;
        return formatIntNoGrouping(v);
    }

    function formatAreaTick(value) {
        const v = Number(value);
        if (!Number.isFinite(v)) return "";
        if (v === areaOverflowLane) return `>${formatIntNoGrouping(areaMax)}`;
        return formatIntNoGrouping(v);
    }

    function toggleStatus(key) {
        setStatusFilter((prev) => ({ ...prev, [key]: !prev[key] }));
    }

    const deleteMatches = useMemo(() => {
        const prefix = deletePrefix.trim().toLowerCase();
        if (!prefix) return points;
        return points.filter((p) => (p.fileName || "").toLowerCase().startsWith(prefix));
    }, [points, deletePrefix]);

    const deletePreview = useMemo(
        () => deleteMatches.slice(0, DELETE_PREVIEW_LIMIT),
        [deleteMatches]
    );
    const placeholdersCount = Math.max(0, DELETE_PREVIEW_LIMIT - deletePreview.length);
    const deleteHasMore = deleteMatches.length > deletePreview.length;

    const [sentPage, setSentPage] = useState(1);
    const sentPageSize = 5;
    const sentTotalPages = Math.max(1, Math.ceil(myPoints.length / sentPageSize));
    const sentPageClamped = clamp(sentPage, 1, sentTotalPages);
    const sentStart = (sentPageClamped - 1) * sentPageSize;
    const sentPageItems = myPoints.slice(sentStart, sentStart + sentPageSize);
    const sentTotal = myPoints.length;
    const sentPages = useMemo(
        () => Array.from({ length: sentTotalPages }, (_, i) => i + 1),
        [sentTotalPages]
    );

    useEffect(() => {
        const timer = setTimeout(() => setSentPage(1), 0);
        return () => clearTimeout(timer);
    }, [myPoints.length]);

    useEffect(() => {
        if (!navigateNotice) return;
        const t = setTimeout(() => setNavigateNotice(""), 3200);
        return () => clearTimeout(t);
    }, [navigateNotice]);

    useEffect(() => {
        let cancelled = false;

        const clearPoll = () => {
            if (!maintenancePollRef.current) return;
            clearInterval(maintenancePollRef.current);
            maintenancePollRef.current = null;
        };

        const pollOnce = async () => {
            try {
                const status = await fetchMaintenanceStatus({
                    authKey: currentCommand?.role === ROLE_ADMIN ? authKeyDraft : "",
                });
                if (!cancelled) {
                    setMaintenanceStatus({
                        enabled: Boolean(status?.enabled),
                        activeForUser: Boolean(status?.activeForUser),
                        bypass: Boolean(status?.bypass),
                        message: String(status?.message || ""),
                    });
                }
                return {
                    enabled: Boolean(status?.enabled),
                };
            } catch {
                if (!cancelled) {
                    setMaintenanceStatus((prev) => ({
                        ...prev,
                        enabled: false,
                        activeForUser: false,
                    }));
                }
                return { enabled: false };
            }
        };

        if (!currentCommand?.id) {
            clearPoll();
            return () => {
                cancelled = true;
                clearPoll();
            };
        }

        clearPoll();
        void (async () => {
            const initial = await pollOnce();
            if (cancelled || !initial.enabled) return;
            maintenancePollRef.current = setInterval(async () => {
                const next = await pollOnce();
                if (!next.enabled) {
                    clearPoll();
                }
            }, 15000);
        })();

        return () => {
            cancelled = true;
            clearPoll();
        };
    }, [authKeyDraft, currentCommand?.id, currentCommand?.role]);

    function focusPoint(p) {
        if (!p) return;
        setBenchmarkFilter(String(p.benchmark));
        setLastAddedId(p.id);
        setNavigateNotice(
            "Navigation successful. If the point is not visible, make sure it matches current filters."
        );
    }

    if (!currentCommand) {
        return (
            <LoginPage
                isBootstrapping={isBootstrapping}
                isAuthChecking={isAuthChecking}
                authKeyDraft={authKeyDraft}
                authError={authError}
                onAuthKeyDraftChange={setAuthKeyDraft}
                onLogin={tryLogin}
            />
        );
    }

    if (maintenanceStatus.activeForUser && !isLocalRuntime) {
        return <MaintenanceScreen />;
    }

    const isTestBenchSelected = benchmarkFilter === "test";
    const benchmarkLabel = benchmarkFilter === "test" ? "test" : String(benchmarkFilter);
    const truthTableOn =
        benchmarkFilter !== "test" &&
        points.some((p) => String(p.benchmark) === String(benchmarkFilter) && p.hasTruth);

    return (
        <div className="page">
            <header className="topbar">
                <div className="brand">
                    <div className="title">Circuit Control Platform</div>
                </div>

                <div className="topbarRight">
                    <div className="hello helloWithMeta">
                        <span>Hello,</span>
                        <b className="helloName">{currentCommand.name}!</b>
                        <div className="helloMetaCard">
                            <div className="helloMetaRow">
                                <span className="helloMetaLabel">Role</span>
                                <span className="helloMetaValue">{getRoleLabel(currentCommand?.role)}</span>
                            </div>
                            <div className="helloMetaRow">
                                <span className="helloMetaLabel">Color</span>
                                <span className="helloMetaValue">
                                    <span className="helloColorSwatch" style={{ background: currentCommand.color }} />
                                </span>
                            </div>
                        </div>
                    </div>
                    {isAdmin ? (
                        <span className={`serverStatus ${maintenanceStatus.enabled ? "serverOff" : "serverOn"}`}>
                            <span className="serverStatusDot" />
                            {maintenanceStatus.enabled ? "server off" : "server on"}
                        </span>
                    ) : null}
                    <div className="pill subtle">
                        Multi-file quota: {formatGb(remainingUploadBytes)}/{formatGb(totalUploadQuotaBytes)} GB
                    </div>
                    <button className="btn ghost small" type="button" onClick={logout}>
                        Log out
                    </button>
                </div>
            </header>

            <main className="layout">
                <div className="leftCol">
                    <ChartSection
                        isTestBenchSelected={isTestBenchSelected}
                        onGenerateRandomTestPoints={generateRandomTestPoints}
                        onClearAllTestNoConfirm={clearAllTestNoConfirm}
                        onDownloadBenchmarksExcel={downloadBenchmarksExcel}
                        delayOverflowLane={delayOverflowLane}
                        areaOverflowLane={areaOverflowLane}
                        delayAxis={delayAxis}
                        areaAxis={areaAxis}
                        formatDelayTick={formatDelayTick}
                        formatAreaTick={formatAreaTick}
                        areaAxisWidth={areaAxisWidth}
                        paretoDisplay={paretoDisplay}
                        pointsRenderKey={pointsRenderKey}
                        plottedPoints={plottedPoints}
                        colorMode={colorMode}
                        commandByName={commandByName}
                        lastAddedId={lastAddedId}
                        onOpenPointActionModal={openPointActionModal}
                        applyView={applyView}
                        delayMaxDraft={delayMaxDraft}
                        onDelayMaxDraftChange={setDelayMaxDraft}
                        areaMaxDraft={areaMaxDraft}
                        onAreaMaxDraftChange={setAreaMaxDraft}
                        delayViewValid={delayViewValid}
                        areaViewValid={areaViewValid}
                        canApplyView={canApplyView}
                        onFitViewToPareto={fitViewToPareto}
                        onFitViewToAllVisiblePoints={fitViewToAllVisiblePoints}
                        truthTableOn={truthTableOn}
                    />

                    <SentPointsSection
                        myPoints={myPoints}
                        sentPageItems={sentPageItems}
                        sentTotal={sentTotal}
                        sentStart={sentStart}
                        sentPages={sentPages}
                        sentPageClamped={sentPageClamped}
                        onSentPageChange={setSentPage}
                        onFocusPoint={focusPoint}
                        onDownloadCircuit={downloadCircuit}
                        getPointDownloadUrl={getPointDownloadUrl}
                    />
                </div>

                <aside className="side">
                    <FiltersSection
                        benchmarkMenuRef={benchmarkMenuRef}
                        benchmarkMenuOpen={benchmarkMenuOpen}
                        benchmarkLabel={benchmarkLabel}
                        onBenchmarkMenuToggle={() => setBenchmarkMenuOpen((v) => !v)}
                        onSelectBenchmark={onSelectBenchmark}
                        availableBenchmarks={availableBenchmarks}
                        colorMode={colorMode}
                        onColorModeChange={setColorMode}
                        commandQuery={commandQuery}
                        onCommandQueryChange={setCommandQuery}
                        availableCommandNames={availableCommandNames}
                        addSelectedCommand={addSelectedCommand}
                        selectedCommandSet={selectedCommandSet}
                        selectedCommands={selectedCommands}
                        commandByName={commandByName}
                        removeSelectedCommand={removeSelectedCommand}
                        statusFilter={statusFilter}
                        toggleStatus={toggleStatus}
                    />

                    <AddPointSection
                        formatGb={formatGb}
                        maxSingleUploadBytes={maxSingleUploadBytes}
                        remainingUploadBytes={remainingUploadBytes}
                        totalUploadQuotaBytes={totalUploadQuotaBytes}
                        maxMultiFileBatchCount={maxMultiFileBatchCount}
                        addPointFromFile={addPointFromFile}
                        fileInputRef={fileInputRef}
                        benchFiles={benchFiles}
                        canAdd={canAdd}
                        onFileChange={onFileChange}
                        descriptionDraft={descriptionDraft}
                        onDescriptionDraftChange={(value) => {
                            setDescriptionDraft(value.slice(0, MAX_DESCRIPTION_LEN));
                            setUploadError(" ");
                        }}
                        uploadError={uploadError}
                        uploadVerdictNote={uploadVerdictNote}
                            isUploading={isUploading}
                            isUploadStopping={isUploadStopping}
                            uploadProgress={uploadProgress}
                            uploadLiveRows={uploadLiveRows}
                            showUploadMonitor={showUploadMonitor}
                            uploadLogText={uploadLogText}
                            onDownloadUploadLog={downloadUploadLog}
                            onStopUpload={requestStopUpload}
                        selectedChecker={selectedChecker}
                        onSelectedCheckerChange={setSelectedChecker}
                        canUseFastHex={canUseFastHex}
                        selectedParser={selectedParser}
                        onSelectedParserChange={setSelectedParser}
                        checkerTleSecondsDraft={checkerTleSecondsDraft}
                        onCheckerTleSecondsDraftChange={setCheckerTleSecondsDraft}
                        checkerTleMaxSeconds={verifyTimeoutQuotaSeconds}
                        parserTleSecondsDraft={parserTleSecondsDraft}
                        onParserTleSecondsDraftChange={setParserTleSecondsDraft}
                        parserTleMaxSeconds={metricsTimeoutQuotaSeconds}
                        isUploadSettingsOpen={isUploadSettingsOpen}
                        onToggleUploadSettings={() => setIsUploadSettingsOpen((v) => !v)}
                        showManualApplyButton={showManualApplyButton}
                        onOpenManualApply={openManualApplyModal}
                        uploadDisabledReason={uploadDisabledReason}
                    />

                    {isAdmin ? (
                        <AdminSettingsSection
                            adminUserIdDraft={adminUserIdDraft}
                            onAdminUserIdDraftChange={setAdminUserIdDraft}
                            loadAdminUser={loadAdminUser}
                            downloadAllSchemesZip={downloadAllSchemesZip}
                            adminSchemesExportScope={adminSchemesExportScope}
                            onAdminSchemesExportScopeChange={setAdminSchemesExportScope}
                            adminSchemesVerdictScope={adminSchemesVerdictScope}
                            onAdminSchemesVerdictScopeChange={setAdminSchemesVerdictScope}
                            isAdminSchemesExportModalOpen={isAdminSchemesExportModalOpen}
                            closeAdminSchemesExportModal={() => setIsAdminSchemesExportModalOpen(false)}
                            startAdminSchemesExportFromModal={startAdminSchemesExportFromModal}
                            downloadDatabaseExport={downloadDatabaseExport}
                            isAdminLoading={isAdminLoading}
                            isAdminSchemesExporting={isAdminSchemesExporting}
                            isAdminDbExporting={isAdminDbExporting}
                            adminSchemesExportProgress={adminSchemesExportProgress}
                            adminDbExportProgress={adminDbExportProgress}
                            adminExportError={adminExportError}
                            adminPanelError={adminPanelError}
                            adminUser={adminUser}
                            formatGb={formatGb}
                            adminSingleGbDraft={adminSingleGbDraft}
                            onAdminSingleGbDraftChange={setAdminSingleGbDraft}
                            adminTotalGbDraft={adminTotalGbDraft}
                            onAdminTotalGbDraftChange={setAdminTotalGbDraft}
                            adminBatchCountDraft={adminBatchCountDraft}
                            onAdminBatchCountDraftChange={setAdminBatchCountDraft}
                            adminVerifyTleSecondsDraft={adminVerifyTleSecondsDraft}
                            onAdminVerifyTleSecondsDraftChange={setAdminVerifyTleSecondsDraft}
                            adminMetricsTleSecondsDraft={adminMetricsTleSecondsDraft}
                            onAdminMetricsTleSecondsDraftChange={setAdminMetricsTleSecondsDraft}
                            isMaintenanceModeEnabled={isMaintenanceModeEnabled}
                            onMaintenanceModeEnabledChange={setIsMaintenanceModeEnabled}
                            maintenanceMessageDraft={maintenanceMessageDraft}
                            onMaintenanceMessageDraftChange={setMaintenanceMessageDraft}
                            maintenanceWhitelistDraft={maintenanceWhitelistDraft}
                            onMaintenanceWhitelistDraftChange={setMaintenanceWhitelistDraft}
                            saveMaintenanceSettings={saveMaintenanceSettings}
                            saveAdminUserSettings={saveAdminUserSettings}
                            isAdminSaving={isAdminSaving}
                            isAdminQuotaSettingsOpen={isAdminQuotaSettingsOpen}
                            onToggleAdminQuotaSettings={() => setIsAdminQuotaSettingsOpen((v) => !v)}
                            adminLogCommandQuery={adminLogCommandQuery}
                            onAdminLogCommandQueryChange={setAdminLogCommandQuery}
                            adminLogActionQuery={adminLogActionQuery}
                            onAdminLogActionQueryChange={setAdminLogActionQuery}
                            availableAdminLogActions={availableAdminLogActions}
                            addSelectedAdminLogAction={addSelectedAdminLogAction}
                            selectedAdminLogActionSet={selectedAdminLogActionSet}
                            selectedAdminLogActions={selectedAdminLogActions}
                            removeSelectedAdminLogAction={removeSelectedAdminLogAction}
                            adminLogPageItems={adminLogsPreview}
                            adminLogsTotal={filteredAdminLogs.length}
                            adminLogsHasMore={adminLogsHasMore}
                            truthFilesInputRef={truthFilesInputRef}
                            onTruthFilesChange={onTruthFilesChange}
                            uploadTruthTables={uploadTruthTables}
                            isTruthUploading={isTruthUploading}
                            truthUploadError={truthUploadError}
                            truthUploadLogText={truthUploadLogText}
                            truthUploadProgress={truthUploadProgress}
                            onDownloadTruthUploadLog={downloadTruthUploadLog}
                            truthConflicts={truthConflicts}
                            isTruthConflictModalOpen={isTruthConflictModalOpen}
                            setTruthConflictChecked={setTruthConflictChecked}
                            selectAllTruthConflicts={selectAllTruthConflicts}
                            clearAllTruthConflicts={clearAllTruthConflicts}
                            applyTruthConflicts={applyTruthConflicts}
                            closeTruthConflictModal={closeTruthConflictModal}
                            runBulkVerifyAllPoints={runBulkVerifyAllPoints}
                            selectedBulkVerifyChecker={selectedBulkVerifyChecker}
                            onSelectedBulkVerifyCheckerChange={setSelectedBulkVerifyChecker}
                            bulkVerifyIncludeVerified={bulkVerifyIncludeVerified}
                            onBulkVerifyIncludeVerifiedChange={setBulkVerifyIncludeVerified}
                            stopBulkVerifyAllPoints={stopBulkVerifyAllPoints}
                            isBulkVerifyRunning={isBulkVerifyRunning}
                            bulkVerifyCurrentFileName={bulkVerifyCurrentFileName}
                            bulkVerifyProgress={bulkVerifyProgress}
                            bulkVerifyLogText={bulkVerifyLogText}
                            onDownloadBulkVerifyLog={downloadBulkVerifyLog}
                            runBulkMetricsAudit={runBulkMetricsAudit}
                            stopBulkMetricsAudit={stopBulkMetricsAudit}
                            isBulkMetricsAuditRunning={isBulkMetricsAuditRunning}
                            bulkMetricsAuditCurrentFileName={bulkMetricsAuditCurrentFileName}
                            bulkMetricsAuditProgress={bulkMetricsAuditProgress}
                            bulkMetricsAuditLogText={bulkMetricsAuditLogText}
                            onDownloadBulkMetricsAuditLog={downloadBulkMetricsAuditLog}
                            runBulkIdenticalAudit={runBulkIdenticalAudit}
                            stopBulkIdenticalAudit={stopBulkIdenticalAudit}
                            isBulkIdenticalAuditRunning={isBulkIdenticalAuditRunning}
                            bulkIdenticalAuditSummary={bulkIdenticalAuditSummary}
                            bulkIdenticalAuditLogText={bulkIdenticalAuditLogText}
                            bulkIdenticalAuditProgress={bulkIdenticalAuditProgress}
                            bulkIdenticalAuditCurrentFileName={bulkIdenticalAuditCurrentFileName}
                            onDownloadBulkIdenticalAuditLog={downloadBulkIdenticalAuditLog}
                            bulkIdenticalGroups={bulkIdenticalGroups}
                            bulkIdenticalPickerGroupId={bulkIdenticalPickerGroupId}
                            isBulkIdenticalApplyModalOpen={isBulkIdenticalApplyModalOpen}
                            isBulkIdenticalApplying={isBulkIdenticalApplying}
                            setBulkIdenticalGroupChecked={setBulkIdenticalGroupChecked}
                            openBulkIdenticalGroupPicker={openBulkIdenticalGroupPicker}
                            closeBulkIdenticalGroupPicker={closeBulkIdenticalGroupPicker}
                            setBulkIdenticalGroupKeepPoint={setBulkIdenticalGroupKeepPoint}
                            selectAllBulkIdenticalGroups={selectAllBulkIdenticalGroups}
                            clearAllBulkIdenticalGroups={clearAllBulkIdenticalGroups}
                            applySelectedBulkIdenticalGroups={applySelectedBulkIdenticalGroups}
                            closeBulkIdenticalApplyModal={closeBulkIdenticalApplyModal}
                            bulkVerifyCandidates={bulkVerifyCandidates}
                            isBulkVerifyApplyModalOpen={isBulkVerifyApplyModalOpen}
                            setBulkVerifyCandidateChecked={setBulkVerifyCandidateChecked}
                            selectAllBulkVerifyCandidates={selectAllBulkVerifyCandidates}
                            clearAllBulkVerifyCandidates={clearAllBulkVerifyCandidates}
                            applySelectedBulkVerifyCandidates={applySelectedBulkVerifyCandidates}
                            closeBulkVerifyApplyModal={closeBulkVerifyApplyModal}
                        />
                    ) : null}

                    <FindPointsSection
                        deletePrefix={deletePrefix}
                        onDeletePrefixChange={setDeletePrefix}
                        deletePreview={deletePreview}
                        placeholdersCount={placeholdersCount}
                        deleteMatches={deleteMatches}
                        deleteHasMore={deleteHasMore}
                        onFocusPoint={focusPoint}
                        onDownloadCircuit={downloadCircuit}
                        getPointDownloadUrl={getPointDownloadUrl}
                        canTestPoint={canTestPoint}
                        onTestPoint={onTestPoint}
                        selectedTestChecker={selectedTestChecker}
                        onSelectedTestCheckerChange={setSelectedTestChecker}
                        canUseFastHex={canUseFastHex}
                        testingPointId={testingPointId}
                        testingPointLabel={testingPointLabel}
                        canDeletePoint={canDeletePoint}
                        onConfirmAndDeletePoint={confirmAndDeletePoint}
                    />
                </aside>
            </main>

            <PointActionModal
                actionPoint={actionPoint}
                closePointActionModal={closePointActionModal}
                onDownloadCircuit={downloadCircuit}
                getPointDownloadUrl={getPointDownloadUrl}
                canTestPoint={canTestPoint}
                onTestPoint={onTestPoint}
                selectedTestChecker={selectedTestChecker}
                onSelectedTestCheckerChange={setSelectedTestChecker}
                canUseFastHex={canUseFastHex}
                testingPointId={testingPointId}
                testingPointLabel={testingPointLabel}
                canDeletePoint={canDeletePoint}
                confirmAndDeletePoint={confirmAndDeletePoint}
            />

            <ManualPointApplyModal
                open={isManualApplyOpen}
                rows={manualApplyRows}
                onToggle={setManualApplyChecked}
                onApply={applyManualRows}
                onClose={closeManualApplyModal}
                isApplying={isManualApplying}
            />

            {navigateNotice ? (
                <div className="navigateToast" role="status" aria-live="polite">
                    {navigateNotice}
                </div>
            ) : null}

            <footer className="footer" />
        </div>
    );
}

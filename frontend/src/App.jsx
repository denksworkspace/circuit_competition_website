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
import { SubmissionsDeleteModal } from "./components/app/SubmissionsDeleteModal.jsx";
import { MaintenanceScreen } from "./components/app/MaintenanceScreen.jsx";
import { ParetoExportModal } from "./components/app/ParetoExportModal.jsx";
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
import { downloadBlobAsFile, downloadTextAsFile } from "./utils/fileDownloadUtils.js";
import { exportParetoPointsZip, fetchAdminExportProgress, fetchMaintenanceStatus } from "./services/apiClient.js";
import paretoPortraitImage from "./assets/vilfredo-pareto-portrait.jpg";

const CHECKER_ABC = "ABC";
const CHECKER_ABC_FAST_HEX = "ABC_FAST_HEX";
const DEFAULT_CHECKER_VERSION = CHECKER_ABC;
const ENABLED_CHECKERS = new Set([CHECKER_ABC, CHECKER_ABC_FAST_HEX]);
const DATE_SLIDER_MIN_UTC_MS = Date.UTC(2026, 1, 1);
const DEFAULT_PARETO_EXPORT_BASELINE_UTC_MS = Date.UTC(2026, 2, 23, 0, 0, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;
const INITIAL_DATE_SLIDER_MAX_UTC_MS = Math.max(DATE_SLIDER_MIN_UTC_MS, toUtcDayStartMs(Date.now()));

function toUtcDayStartMs(input) {
    const date = new Date(input);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function toIsoDateLabel(utcMs) {
    return new Date(utcMs).toISOString().slice(0, 10);
}

function parseUtcDateStartMs(raw) {
    const value = String(raw || "").trim();
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
    const utcMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
    const date = new Date(utcMs);
    if (
        date.getUTCFullYear() !== year
        || date.getUTCMonth() !== month - 1
        || date.getUTCDate() !== day
    ) {
        return null;
    }
    return utcMs;
}

function toIsoDateTimeLabel(utcMs) {
    const value = Number(utcMs);
    if (!Number.isFinite(value)) return "-";
    const date = new Date(value);
    const yyyy = String(date.getUTCFullYear());
    const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(date.getUTCDate()).padStart(2, "0");
    const hh = String(date.getUTCHours()).padStart(2, "0");
    const mi = String(date.getUTCMinutes()).padStart(2, "0");
    const ss = String(date.getUTCSeconds()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss} UTC`;
}

function toUnixMs(valueRaw) {
    const parsed = Date.parse(String(valueRaw || ""));
    if (!Number.isFinite(parsed)) return null;
    return parsed;
}

function getPointCreatedAtMs(point) {
    const value = Date.parse(String(point?.createdAt || ""));
    if (!Number.isFinite(value)) return null;
    return value;
}

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
    const {
        benchmarkMenuOpen: submissionBenchmarkMenuOpen,
        setBenchmarkMenuOpen: setSubmissionBenchmarkMenuOpen,
        benchmarkMenuRef: submissionBenchmarkMenuRef,
    } = useBenchmarkMenu();
    const {
        benchmarkMenuOpen: paretoExportBenchmarkMenuOpen,
        setBenchmarkMenuOpen: setParetoExportBenchmarkMenuOpen,
        benchmarkMenuRef: paretoExportBenchmarkMenuRef,
    } = useBenchmarkMenu();

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
    const maintenanceEnabledPrevRef = useRef(false);
    const [hasNewPareto, setHasNewPareto] = useState(() => Boolean(currentCommand?.hasNewPareto));
    const [lastParetoExportAt, setLastParetoExportAt] = useState(() => currentCommand?.lastParetoExportAt || null);
    const [isParetoExportModalOpen, setIsParetoExportModalOpen] = useState(false);
    const [paretoExportDateMode, setParetoExportDateMode] = useState("since_last_export");
    const [paretoExportDate, setParetoExportDate] = useState(() => toIsoDateLabel(DEFAULT_PARETO_EXPORT_BASELINE_UTC_MS));
    const [paretoExportBench, setParetoExportBench] = useState("all");
    const [paretoExportBenchmarkInputValue, setParetoExportBenchmarkInputValue] = useState("all");
    const [paretoExportParetoOnly, setParetoExportParetoOnly] = useState(true);
    const [paretoExportStatusFilter, setParetoExportStatusFilter] = useState(() => ({
        "non-verified": false,
        verified: true,
        failed: false,
    }));
    const [isParetoExporting, setIsParetoExporting] = useState(false);
    const [paretoExportProgress, setParetoExportProgress] = useState(null);
    const [paretoExportError, setParetoExportError] = useState("");
    const paretoExportProgressPollRef = useRef(null);
    const paretoExportProgressAbortRef = useRef(null);

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
        bulkVerifyStatusFilter,
        toggleBulkVerifyStatus,
        bulkVerifyIncludeDeleted,
        setBulkVerifyIncludeDeleted,
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
        deletePointById,
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
    const [benchmarkInputValue, setBenchmarkInputValue] = useState("test");
    const [colorMode, setColorMode] = useState("status");
    const [statusFilter, setStatusFilter] = useState({
        "non-verified": true,
        verified: true,
        failed: false,
    });
    const [showParetoOnly, setShowParetoOnly] = useState(false);
    const [submissionStatusFilter, setSubmissionStatusFilter] = useState(() => ({
        "non-verified": true,
        verified: true,
        failed: true,
    }));
    const [submissionBenchmarkFilter, setSubmissionBenchmarkFilter] = useState("all");
    const [submissionBenchmarkInputValue, setSubmissionBenchmarkInputValue] = useState("all");
    const [submissionSortOrder, setSubmissionSortOrder] = useState("desc");
    const [submissionParetoOnly, setSubmissionParetoOnly] = useState(false);
    const [selectedSubmissionIds, setSelectedSubmissionIds] = useState(() => []);
    const [isSubmissionsDeleteModalOpen, setIsSubmissionsDeleteModalOpen] = useState(false);
    const [isSubmissionsDeleting, setIsSubmissionsDeleting] = useState(false);
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
        manualApplyProgress,
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
        wakeUploadQueuePolling,
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
    const dateSliderMaxUtcMs = INITIAL_DATE_SLIDER_MAX_UTC_MS;
    const dateSliderMaxDays = useMemo(
        () => Math.floor((dateSliderMaxUtcMs - DATE_SLIDER_MIN_UTC_MS) / DAY_MS),
        [dateSliderMaxUtcMs]
    );
    const [dateSliderDayOffset, setDateSliderDayOffset] = useState(() => dateSliderMaxDays);
    const dateSliderCurrentUtcMs = DATE_SLIDER_MIN_UTC_MS + clamp(dateSliderDayOffset, 0, dateSliderMaxDays) * DAY_MS;
    const dateSliderCurrentLabel = toIsoDateLabel(dateSliderCurrentUtcMs);
    const dateSliderMaxLabel = toIsoDateLabel(dateSliderMaxUtcMs);
    const dateSliderCutoffMs = dateSliderCurrentUtcMs + DAY_MS - 1;

    const delayAxis = useMemo(() => buildAxis(delayMax, DIVISIONS, MAX_VALUE), [delayMax]);
    const areaAxis = useMemo(() => buildAxis(areaMax, DIVISIONS, MAX_VALUE), [areaMax]);
    const delayOverflowLane = delayAxis.overflow;
    const areaOverflowLane = areaAxis.overflow;
    const pointsUpToSliderDate = useMemo(
        () =>
            points.filter((point) => {
                const createdAtMs = getPointCreatedAtMs(point);
                if (createdAtMs == null) return true;
                return createdAtMs <= dateSliderCutoffMs;
            }),
        [points, dateSliderCutoffMs]
    );
    const availableBenchmarks = useMemo(() => {
        const numeric = new Set();
        for (const p of pointsUpToSliderDate) {
            if (p.benchmark !== "test") numeric.add(Number(p.benchmark));
        }
        return Array.from(numeric).sort((a, b) => a - b);
    }, [pointsUpToSliderDate]);
    const benchmarkOptionValues = useMemo(
        () => ["test", ...availableBenchmarks.map((value) => String(value))],
        [availableBenchmarks]
    );
    const paretoExportBenchmarkOptions = useMemo(() => {
        const values = new Set();
        for (const point of points) {
            if (String(point?.benchmark || "") === "test") continue;
            const benchmark = String(point?.benchmark || "").trim();
            if (!benchmark) continue;
            values.add(benchmark);
        }
        return ["all", ...Array.from(values).sort((lhs, rhs) => Number(lhs) - Number(rhs))];
    }, [points]);
    const benchmarkInputSuggestions = useMemo(() => {
        const query = benchmarkInputValue.trim().toLowerCase();
        return benchmarkOptionValues.filter((value) => {
            if (!query) return true;
            return value.toLowerCase().startsWith(query);
        });
    }, [benchmarkInputValue, benchmarkOptionValues]);
    const paretoExportBenchmarkInputSuggestions = useMemo(() => {
        const query = paretoExportBenchmarkInputValue.trim().toLowerCase();
        return paretoExportBenchmarkOptions.filter((value) => {
            if (!query) return true;
            return value.toLowerCase().startsWith(query);
        });
    }, [paretoExportBenchmarkInputValue, paretoExportBenchmarkOptions]);
    const paretoExportSinceLastMs = useMemo(
        () => toUnixMs(lastParetoExportAt) ?? DEFAULT_PARETO_EXPORT_BASELINE_UTC_MS,
        [lastParetoExportAt]
    );
    const paretoExportCustomStartMs = useMemo(
        () => parseUtcDateStartMs(paretoExportDate),
        [paretoExportDate]
    );
    const paretoExportEffectiveStartMs = paretoExportDateMode === "custom_date"
        ? paretoExportCustomStartMs
        : paretoExportSinceLastMs;
    const paretoExportEffectiveStartLabel = useMemo(
        () => toIsoDateTimeLabel(paretoExportEffectiveStartMs),
        [paretoExportEffectiveStartMs]
    );
    const paretoExportDateMaxUtcMs = toUtcDayStartMs(Date.now());
    const paretoExportDateMinUtcMs = paretoExportDateMaxUtcMs - 7 * DAY_MS;
    const paretoExportDateMaxLabel = toIsoDateLabel(paretoExportDateMaxUtcMs);
    const paretoExportDateMinLabel = toIsoDateLabel(paretoExportDateMinUtcMs);

    // Commands shown in the "Users" picker:
    // show ONLY senders that have at least one point in the currently selected benchmark.
    // (If benchmark is "test" -> only test points; otherwise only that numeric benchmark.)
    const availableCommandNames = useMemo(() => {
        const set = new Set();
        for (const p of pointsUpToSliderDate) {
            if (benchmarkFilter === "test") {
                if (p.benchmark === "test") set.add(p.sender);
            } else {
                if (String(p.benchmark) === String(benchmarkFilter)) set.add(p.sender);
            }
        }
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [pointsUpToSliderDate, benchmarkFilter]);



    // Visible points = benchmark filter + status filter (NOT dependent on view rectangle)
    const visiblePoints = useMemo(() => {
        return pointsUpToSliderDate.filter((p) => {
            if (benchmarkFilter === "test") {
                if (p.benchmark !== "test") return false;
            } else {
                if (String(p.benchmark) !== String(benchmarkFilter)) return false;
            }
            if (!statusFilter[p.status]) return false;
            if (selectedCommands.length > 0 && !selectedCommandSet.has(p.sender)) return false;
            return true;
        });
    }, [pointsUpToSliderDate, benchmarkFilter, statusFilter, selectedCommands, selectedCommandSet]);

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
        setBenchmarkInputValue(nextBenchmark);
        setBenchmarkMenuOpen(false);

        const nextVisible = pointsUpToSliderDate.filter((p) => {
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
    }, [fitViewToPoints, pointsUpToSliderDate, selectedCommandSet, selectedCommands.length, setBenchmarkMenuOpen, statusFilter]);

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
            (showParetoOnly ? paretoBase : visiblePoints).map((p) =>
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
        [showParetoOnly, paretoBase, visiblePoints, delayMax, areaMax, delayAxis.step, areaAxis.step, delayOverflowLane, areaOverflowLane]
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
                showParetoOnly ? 1 : 0,
                dateSliderDayOffset,
                selectedCommands.join("|"),
            ].join(":"),
        [delayMax, areaMax, colorMode, benchmarkFilter, statusFilter, showParetoOnly, dateSliderDayOffset, selectedCommands]
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
    const currentParetoPointIdSet = useMemo(() => {
        const byBenchmark = new Map();
        for (const point of points) {
            const benchmark = String(point?.benchmark || "");
            if (!byBenchmark.has(benchmark)) byBenchmark.set(benchmark, []);
            byBenchmark.get(benchmark).push(point);
        }
        const ids = new Set();
        for (const benchmarkPoints of byBenchmark.values()) {
            const front = computeParetoFrontOriginal(benchmarkPoints);
            for (const point of front) {
                ids.add(String(point.id || ""));
            }
        }
        return ids;
    }, [points]);

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
                createdAt: new Date().toISOString(),
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

    function stopParetoExportProgressPoll() {
        if (paretoExportProgressPollRef.current) {
            clearInterval(paretoExportProgressPollRef.current);
            paretoExportProgressPollRef.current = null;
        }
    }

    function startParetoExportProgressPoll({ token, signal }) {
        stopParetoExportProgressPoll();
        const poll = async () => {
            if (signal.aborted) return;
            try {
                const progress = await fetchAdminExportProgress({ token, signal });
                setParetoExportProgress(progress);
                if (progress?.doneFlag) {
                    stopParetoExportProgressPoll();
                }
            } catch {
                // Export starts asynchronously; transient polling failures are expected.
            }
        };
        paretoExportProgressPollRef.current = setInterval(poll, 500);
        poll();
    }

    useEffect(() => () => {
        stopParetoExportProgressPoll();
        if (paretoExportProgressAbortRef.current) {
            paretoExportProgressAbortRef.current.abort();
            paretoExportProgressAbortRef.current = null;
        }
    }, []);

    function openParetoExportModal() {
        setParetoExportError("");
        setParetoExportProgress(null);
        setIsParetoExportModalOpen(true);
    }

    function closeParetoExportModal() {
        if (isParetoExporting) return;
        setIsParetoExportModalOpen(false);
    }

    async function downloadParetoExportZip() {
        if (!authKeyDraft.trim() || isParetoExporting) return;
        const mode = paretoExportDateMode === "custom_date" ? "from_date" : "all_new";
        const includedStatuses = Object.entries(paretoExportStatusFilter)
            .filter(([, enabled]) => Boolean(enabled))
            .map(([status]) => status);
        if (mode === "from_date") {
            const customDateStartMs = parseUtcDateStartMs(paretoExportDate);
            if (customDateStartMs == null) {
                setParetoExportError("Select date.");
                return;
            }
            if (customDateStartMs < paretoExportDateMinUtcMs || customDateStartMs > paretoExportDateMaxUtcMs) {
                setParetoExportError("Date must be within the last 7 days.");
                return;
            }
        }
        setParetoExportError("");
        setIsParetoExporting(true);
        setParetoExportProgress({
            status: "queued",
            done: 0,
            total: 0,
            downloaded: 0,
        });
        const controller = new AbortController();
        paretoExportProgressAbortRef.current = controller;
        const progressToken = uid();
        startParetoExportProgressPoll({ token: progressToken, signal: controller.signal });
        try {
            const result = await exportParetoPointsZip({
                authKey: authKeyDraft,
                mode,
                fromDate: mode === "from_date" ? paretoExportDate : "",
                bench: paretoExportBench,
                paretoOnly: paretoExportParetoOnly,
                includedStatuses,
                progressToken,
                signal: controller.signal,
            });
            downloadBlobAsFile(result.blob, result.fileName || "pareto-points-export.zip");
            setIsParetoExportModalOpen(false);
            setHasNewPareto(false);
            setLastParetoExportAt(new Date().toISOString());
        } catch (error) {
            if (error?.name === "AbortError") {
                setParetoExportError("Export cancelled.");
                return;
            }
            setParetoExportError(error?.message || "Failed to export points.");
        } finally {
            if (paretoExportProgressAbortRef.current === controller) {
                paretoExportProgressAbortRef.current = null;
            }
            stopParetoExportProgressPoll();
            setIsParetoExporting(false);
        }
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

    function toggleSubmissionStatus(key) {
        setSubmissionStatusFilter((prev) => ({ ...prev, [key]: !prev[key] }));
    }

    function toggleParetoExportStatus(key) {
        setParetoExportStatusFilter((prev) => ({ ...prev, [key]: !prev[key] }));
    }

    function setSubmissionSelected(pointId) {
        const id = String(pointId || "");
        if (!id) return;
        setSelectedSubmissionIds((prev) => {
            if (prev.includes(id)) return prev.filter((value) => value !== id);
            return [...prev, id];
        });
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

    const submissionsBenchmarkOptions = useMemo(() => {
        const options = new Set(["all"]);
        for (const point of myPoints) {
            options.add(String(point.benchmark));
        }
        const values = Array.from(options);
        const numeric = values.filter((value) => value !== "all" && value !== "test").sort((a, b) => Number(a) - Number(b));
        const withTest = values.includes("test") ? ["test", ...numeric] : numeric;
        return ["all", ...withTest];
    }, [myPoints]);
    const submissionBenchmarkInputSuggestions = useMemo(() => {
        const query = submissionBenchmarkInputValue.trim().toLowerCase();
        return submissionsBenchmarkOptions.filter((value) => {
            if (!query) return true;
            return value.toLowerCase().startsWith(query);
        });
    }, [submissionBenchmarkInputValue, submissionsBenchmarkOptions]);

    const myPointsFiltered = useMemo(() => {
        const filtered = myPoints.filter((point) => {
            if (!submissionStatusFilter[point.status]) return false;
            if (submissionBenchmarkFilter !== "all" && String(point.benchmark) !== String(submissionBenchmarkFilter)) {
                return false;
            }
            if (submissionParetoOnly && !currentParetoPointIdSet.has(String(point.id || ""))) return false;
            return true;
        });
        filtered.sort((lhs, rhs) => {
            const lhsMs = getPointCreatedAtMs(lhs) || 0;
            const rhsMs = getPointCreatedAtMs(rhs) || 0;
            if (lhsMs !== rhsMs) {
                return submissionSortOrder === "asc" ? lhsMs - rhsMs : rhsMs - lhsMs;
            }
            const lhsId = String(lhs.id || "");
            const rhsId = String(rhs.id || "");
            return submissionSortOrder === "asc" ? lhsId.localeCompare(rhsId) : rhsId.localeCompare(lhsId);
        });
        return filtered;
    }, [
        myPoints,
        submissionStatusFilter,
        submissionBenchmarkFilter,
        submissionParetoOnly,
        currentParetoPointIdSet,
        submissionSortOrder,
    ]);

    const selectedSubmissionIdSet = useMemo(
        () => new Set(selectedSubmissionIds),
        [selectedSubmissionIds]
    );

    const selectedSubmissionModalRows = useMemo(
        () => selectedSubmissionIds
            .map((id) => myPoints.find((point) => point.id === id))
            .filter(Boolean)
            .map((point) => ({
                key: point.id,
                pointId: point.id,
                benchmark: String(point.benchmark),
                delay: Number(point.delay),
                area: Number(point.area),
                fileName: String(point.fileName || point.id || "unknown"),
            })),
        [selectedSubmissionIds, myPoints]
    );
    const [submissionsDeleteRows, setSubmissionsDeleteRows] = useState(() => []);
    const [submissionsDeleteProgress, setSubmissionsDeleteProgress] = useState(null);

    const [sentPage, setSentPage] = useState(1);
    const sentPageSize = 5;
    const sentTotalPages = Math.max(1, Math.ceil(myPointsFiltered.length / sentPageSize));
    const sentPageClamped = clamp(sentPage, 1, sentTotalPages);
    const sentStart = (sentPageClamped - 1) * sentPageSize;
    const sentPageItems = myPointsFiltered.slice(sentStart, sentStart + sentPageSize);
    const sentTotal = myPointsFiltered.length;
    const sentPages = useMemo(
        () => Array.from({ length: sentTotalPages }, (_, i) => i + 1),
        [sentTotalPages]
    );

    useEffect(() => {
        const timer = setTimeout(() => setSentPage(1), 0);
        return () => clearTimeout(timer);
    }, [myPointsFiltered.length]);

    useEffect(() => {
        const currentIds = new Set(myPoints.map((point) => String(point.id || "")));
        setSelectedSubmissionIds((prev) => prev.filter((id) => currentIds.has(id)));
    }, [myPoints]);

    useEffect(() => {
        if (!navigateNotice) return;
        const t = setTimeout(() => setNavigateNotice(""), 3200);
        return () => clearTimeout(t);
    }, [navigateNotice]);

    useEffect(() => {
        setBenchmarkInputValue(String(benchmarkFilter));
    }, [benchmarkFilter]);

    useEffect(() => {
        setSubmissionBenchmarkInputValue(String(submissionBenchmarkFilter));
    }, [submissionBenchmarkFilter]);

    useEffect(() => {
        setParetoExportBenchmarkInputValue(String(paretoExportBench));
    }, [paretoExportBench]);

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

    useEffect(() => {
        const prevEnabled = Boolean(maintenanceEnabledPrevRef.current);
        const nextEnabled = Boolean(maintenanceStatus.enabled);
        if (prevEnabled && !nextEnabled) {
            wakeUploadQueuePolling();
        }
        maintenanceEnabledPrevRef.current = nextEnabled;
    }, [maintenanceStatus.enabled, wakeUploadQueuePolling]);

    useEffect(() => {
        setHasNewPareto(Boolean(currentCommand?.hasNewPareto));
        setLastParetoExportAt(currentCommand?.lastParetoExportAt || null);
    }, [currentCommand?.hasNewPareto, currentCommand?.lastParetoExportAt]);

    useEffect(() => {
        if (paretoExportBenchmarkOptions.includes(paretoExportBench)) return;
        setParetoExportBench("all");
    }, [paretoExportBenchmarkOptions, paretoExportBench]);

    function focusPoint(p) {
        if (!p) return;
        setBenchmarkFilter(String(p.benchmark));
        setBenchmarkInputValue(String(p.benchmark));
        setLastAddedId(p.id);
        setNavigateNotice(
            "Navigation successful. If the point is not visible, make sure it matches current filters."
        );
    }

    function onBenchmarkInputFocus() {
        setBenchmarkInputValue("");
        setBenchmarkMenuOpen(true);
    }

    function onBenchmarkInputChange(value) {
        setBenchmarkInputValue(value);
        setBenchmarkMenuOpen(true);
    }

    function onBenchmarkInputBlur() {
        setBenchmarkInputValue(String(benchmarkFilter));
        setBenchmarkMenuOpen(false);
    }

    function onBenchmarkInputKeyDown(event) {
        if (event.key !== "Enter") return;
        event.preventDefault();
        const nextBenchmark = benchmarkInputValue.trim();
        if (!nextBenchmark) return;
        const matched = benchmarkOptionValues.find((value) => value.toLowerCase() === nextBenchmark.toLowerCase());
        if (!matched) return;
        onSelectBenchmark(matched);
    }

    function onSelectSubmissionBenchmark(benchmark) {
        const nextBenchmark = String(benchmark);
        setSubmissionBenchmarkFilter(nextBenchmark);
        setSubmissionBenchmarkInputValue(nextBenchmark);
        setSubmissionBenchmarkMenuOpen(false);
    }

    function onSubmissionBenchmarkInputFocus() {
        setSubmissionBenchmarkInputValue("");
        setSubmissionBenchmarkMenuOpen(true);
    }

    function onSubmissionBenchmarkInputChange(value) {
        setSubmissionBenchmarkInputValue(value);
        setSubmissionBenchmarkMenuOpen(true);
    }

    function onSubmissionBenchmarkInputBlur() {
        setSubmissionBenchmarkInputValue(String(submissionBenchmarkFilter));
        setSubmissionBenchmarkMenuOpen(false);
    }

    function onSubmissionBenchmarkInputKeyDown(event) {
        if (event.key !== "Enter") return;
        event.preventDefault();
        const nextBenchmark = submissionBenchmarkInputValue.trim();
        if (!nextBenchmark) return;
        const matched = submissionsBenchmarkOptions.find((value) => value.toLowerCase() === nextBenchmark.toLowerCase());
        if (!matched) return;
        onSelectSubmissionBenchmark(matched);
    }

    function onSelectParetoExportBenchmark(benchmark) {
        const nextBenchmark = String(benchmark);
        setParetoExportBench(nextBenchmark);
        setParetoExportBenchmarkInputValue(nextBenchmark);
        setParetoExportBenchmarkMenuOpen(false);
    }

    function onParetoExportBenchmarkInputFocus() {
        setParetoExportBenchmarkInputValue("");
        setParetoExportBenchmarkMenuOpen(true);
    }

    function onParetoExportBenchmarkInputChange(value) {
        setParetoExportBenchmarkInputValue(value);
        setParetoExportBenchmarkMenuOpen(true);
    }

    function onParetoExportBenchmarkInputBlur() {
        setParetoExportBenchmarkInputValue(String(paretoExportBench));
        setParetoExportBenchmarkMenuOpen(false);
    }

    function onParetoExportBenchmarkInputKeyDown(event) {
        if (event.key !== "Enter") return;
        event.preventDefault();
        const nextBenchmark = paretoExportBenchmarkInputValue.trim();
        if (!nextBenchmark) return;
        const matched = paretoExportBenchmarkOptions.find((value) => value.toLowerCase() === nextBenchmark.toLowerCase());
        if (!matched) return;
        onSelectParetoExportBenchmark(matched);
    }

    function openDeleteSelectedSubmissionsModal() {
        if (selectedSubmissionModalRows.length < 1) return;
        setSubmissionsDeleteRows(selectedSubmissionModalRows.map((row) => ({ ...row, checked: true })));
        setIsSubmissionsDeleteModalOpen(true);
    }

    function setSubmissionsDeleteChecked(key, checked) {
        setSubmissionsDeleteRows((prev) =>
            prev.map((row) => (row.key === key ? { ...row, checked: Boolean(checked) } : row))
        );
    }

    async function applyDeleteSelectedSubmissions() {
        const selectedIds = submissionsDeleteRows
            .filter((row) => Boolean(row.checked))
            .map((row) => String(row.pointId || ""));
        if (selectedIds.length < 1) {
            return;
        }
        setIsSubmissionsDeleting(true);
        setSubmissionsDeleteProgress({ processed: 0, total: selectedIds.length });
        try {
            const deleted = [];
            const failed = [];
            for (let index = 0; index < selectedIds.length; index += 1) {
                const pointId = selectedIds[index];
                const ok = await deletePointById(pointId);
                if (ok) deleted.push(pointId);
                else failed.push(pointId);
                setSubmissionsDeleteProgress((prev) => (prev ? { ...prev, processed: index + 1 } : prev));
            }
            setSelectedSubmissionIds((prev) => prev.filter((id) => !deleted.includes(id)));
            setIsSubmissionsDeleteModalOpen(false);
            if (failed.length > 0) {
                window.alert(`Failed to delete ${failed.length} point(s).`);
            }
        } finally {
            setIsSubmissionsDeleting(false);
            setSubmissionsDeleteProgress(null);
        }
    }

    function resetSubmissionSelection() {
        setSelectedSubmissionIds([]);
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
        return <MaintenanceScreen message={maintenanceStatus.message} />;
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
                    <button
                        type="button"
                        className={hasNewPareto ? "bellButton hasNew" : "bellButton"}
                        onClick={openParetoExportModal}
                        aria-label="Open Pareto export"
                        title={lastParetoExportAt
                            ? `Last export: ${new Date(lastParetoExportAt).toISOString()}`
                            : `No export yet. Baseline: ${toIsoDateTimeLabel(DEFAULT_PARETO_EXPORT_BASELINE_UTC_MS)}`}
                    >
                        <img
                            className="bellIcon paretoPortraitIcon"
                            src={paretoPortraitImage}
                            alt="Vilfredo Pareto portrait"
                            loading="eager"
                            decoding="async"
                        />
                        {hasNewPareto ? <span className="bellAlert">!</span> : null}
                    </button>
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
                        dateSliderMaxDays={dateSliderMaxDays}
                        dateSliderDayOffset={dateSliderDayOffset}
                        onDateSliderDayOffsetChange={setDateSliderDayOffset}
                        dateSliderMinLabel={toIsoDateLabel(DATE_SLIDER_MIN_UTC_MS)}
                        dateSliderCurrentLabel={dateSliderCurrentLabel}
                        dateSliderMaxLabel={dateSliderMaxLabel}
                        onFitViewToPareto={fitViewToPareto}
                        onFitViewToAllVisiblePoints={fitViewToAllVisiblePoints}
                        truthTableOn={truthTableOn}
                        chartPointCount={plottedPoints.length}
                    />

                    <SentPointsSection
                        myPoints={myPointsFiltered}
                        sentPageItems={sentPageItems}
                        sentTotal={sentTotal}
                        sentStart={sentStart}
                        sentPages={sentPages}
                        sentPageClamped={sentPageClamped}
                        onSentPageChange={setSentPage}
                        onFocusPoint={focusPoint}
                        onDownloadCircuit={downloadCircuit}
                        getPointDownloadUrl={getPointDownloadUrl}
                        submissionStatusFilter={submissionStatusFilter}
                        toggleSubmissionStatus={toggleSubmissionStatus}
                        submissionBenchmarkFilter={submissionBenchmarkFilter}
                        submissionBenchmarkMenuRef={submissionBenchmarkMenuRef}
                        submissionBenchmarkMenuOpen={submissionBenchmarkMenuOpen}
                        submissionBenchmarkInputValue={submissionBenchmarkInputValue}
                        onSubmissionBenchmarkInputChange={onSubmissionBenchmarkInputChange}
                        onSubmissionBenchmarkInputFocus={onSubmissionBenchmarkInputFocus}
                        onSubmissionBenchmarkInputBlur={onSubmissionBenchmarkInputBlur}
                        onSubmissionBenchmarkInputKeyDown={onSubmissionBenchmarkInputKeyDown}
                        submissionBenchmarkInputSuggestions={submissionBenchmarkInputSuggestions}
                        onSelectSubmissionBenchmark={onSelectSubmissionBenchmark}
                        submissionSortOrder={submissionSortOrder}
                        onSubmissionSortOrderChange={setSubmissionSortOrder}
                        submissionParetoOnly={submissionParetoOnly}
                        onSubmissionParetoOnlyChange={setSubmissionParetoOnly}
                        selectedSubmissionIdSet={selectedSubmissionIdSet}
                        onToggleSubmissionSelected={setSubmissionSelected}
                        onOpenDeleteSelectedModal={openDeleteSelectedSubmissionsModal}
                        onResetSubmissionSelection={resetSubmissionSelection}
                    />
                </div>

                <aside className="side">
                    <FiltersSection
                        benchmarkMenuRef={benchmarkMenuRef}
                        benchmarkMenuOpen={benchmarkMenuOpen}
                        benchmarkLabel={benchmarkLabel}
                        benchmarkInputValue={benchmarkInputValue}
                        onBenchmarkInputChange={onBenchmarkInputChange}
                        onBenchmarkInputFocus={onBenchmarkInputFocus}
                        onBenchmarkInputBlur={onBenchmarkInputBlur}
                        onBenchmarkInputKeyDown={onBenchmarkInputKeyDown}
                        benchmarkInputSuggestions={benchmarkInputSuggestions}
                        onSelectBenchmark={onSelectBenchmark}
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
                        showParetoOnly={showParetoOnly}
                        onShowParetoOnlyChange={setShowParetoOnly}
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
                            bulkVerifyStatusFilter={bulkVerifyStatusFilter}
                            onToggleBulkVerifyStatus={toggleBulkVerifyStatus}
                            bulkVerifyIncludeDeleted={bulkVerifyIncludeDeleted}
                            onBulkVerifyIncludeDeletedChange={setBulkVerifyIncludeDeleted}
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
                            isBulkVerifyApplying={isBulkVerifyApplying}
                            bulkVerifyApplyProgress={bulkVerifyApplyProgress}
                            setBulkVerifyCandidateChecked={setBulkVerifyCandidateChecked}
                            selectAllBulkVerifyCandidates={selectAllBulkVerifyCandidates}
                            clearAllBulkVerifyCandidates={clearAllBulkVerifyCandidates}
                            applySelectedBulkVerifyCandidates={applySelectedBulkVerifyCandidates}
                            closeBulkVerifyApplyModal={closeBulkVerifyApplyModal}
                            bulkIdenticalApplyProgress={bulkIdenticalApplyProgress}
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
                applyProgress={manualApplyProgress}
            />

            <SubmissionsDeleteModal
                open={isSubmissionsDeleteModalOpen}
                rows={submissionsDeleteRows}
                onToggle={setSubmissionsDeleteChecked}
                onApply={applyDeleteSelectedSubmissions}
                onClose={() => setIsSubmissionsDeleteModalOpen(false)}
                isApplying={isSubmissionsDeleting}
                applyProgress={submissionsDeleteProgress}
            />

            <ParetoExportModal
                open={isParetoExportModalOpen}
                dateMode={paretoExportDateMode}
                onDateModeChange={setParetoExportDateMode}
                fromDate={paretoExportDate}
                onFromDateChange={setParetoExportDate}
                fromDateMin={paretoExportDateMinLabel}
                fromDateMax={paretoExportDateMaxLabel}
                effectiveStartLabel={paretoExportEffectiveStartLabel}
                benchLabel={paretoExportBench}
                benchMenuRef={paretoExportBenchmarkMenuRef}
                benchMenuOpen={paretoExportBenchmarkMenuOpen}
                benchInputValue={paretoExportBenchmarkInputValue}
                onBenchInputChange={onParetoExportBenchmarkInputChange}
                onBenchInputFocus={onParetoExportBenchmarkInputFocus}
                onBenchInputBlur={onParetoExportBenchmarkInputBlur}
                onBenchInputKeyDown={onParetoExportBenchmarkInputKeyDown}
                benchInputSuggestions={paretoExportBenchmarkInputSuggestions}
                onSelectBench={onSelectParetoExportBenchmark}
                paretoOnly={paretoExportParetoOnly}
                onParetoOnlyChange={setParetoExportParetoOnly}
                statusFilter={paretoExportStatusFilter}
                onToggleStatus={toggleParetoExportStatus}
                isExporting={isParetoExporting}
                exportProgress={paretoExportProgress}
                onDownload={downloadParetoExportZip}
                onClose={closeParetoExportModal}
                error={paretoExportError}
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

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
import {
    buildAxis,
    buildStoredFileName,
    computeParetoFrontOriginal,
    computePlottedPoint,
    getRoleLabel,
    parseBenchFileName,
    uid,
} from "./utils/pointUtils.js";
import { clamp, formatIntNoGrouping, parsePosIntCapped } from "./utils/numberUtils.js";
import { chooseAreaSmartFromParetoFront, randInt, randomChoice } from "./utils/testPointUtils.js";
import {
    applyAdminPointStatuses,
    deletePoint,
    fetchAdminActionLogs,
    fetchAdminUserById,
    fetchCommandByAuthKey,
    fetchCommands,
    fetchPoints,
    planTruthTablesUpload,
    runAdminBulkVerifyPoint,
    runAdminMetricsAuditPoint,
    requestUploadUrl,
    requestTruthUploadUrl,
    savePoint,
    saveTruthTable,
    updateAdminUserUploadSettings,
    validateUploadCircuits,
    fetchVerifyPointProgress,
    verifyPointCircuit,
} from "./services/apiClient.js";

const MAX_TRUTH_BATCH_FILES = 100;
const CHECKER_ABC = "ABC";
const CHECKER_ABC_FAST_HEX = "ABC_FAST_HEX";
const DEFAULT_CHECKER_VERSION = CHECKER_ABC;
const ENABLED_CHECKERS = new Set([CHECKER_ABC, CHECKER_ABC_FAST_HEX]);

export default function App() {
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

    const [authKeyDraft, setAuthKeyDraft] = useState(() => localStorage.getItem("bench_auth_key") || "");
    const [currentCommand, setCurrentCommand] = useState(null);
    const [authError, setAuthError] = useState("");
    const [isAuthChecking, setIsAuthChecking] = useState(false);
    const [isBootstrapping, setIsBootstrapping] = useState(true);

    async function tryLogin(e) {
        e.preventDefault();
        const k = authKeyDraft.trim();
        if (!k) {
            setAuthError("Key is required.");
            return;
        }
        setIsAuthChecking(true);
        try {
            const cmd = await fetchCommandByAuthKey(k);
            if (!cmd) throw new Error("Invalid key.");
            localStorage.setItem("bench_auth_key", k);
            setCurrentCommand(cmd);
            setAuthError("");
        } catch (err) {
            setAuthError(err?.message || "Invalid key.");
            setCurrentCommand(null);
        } finally {
            setIsAuthChecking(false);
        }
    }

    function logout() {
        localStorage.removeItem("bench_auth_key");
        setCurrentCommand(null);
        setAuthKeyDraft("");
        setAuthError("");
    }

    // Command filter (Codeforces-like tag chips). If none selected -> show all.
    const [commandQuery, setCommandQuery] = useState("");
    const [selectedCommands, setSelectedCommands] = useState(() => []);
    const selectedCommandSet = useMemo(() => new Set(selectedCommands), [selectedCommands]);
    const [benchmarkMenuOpen, setBenchmarkMenuOpen] = useState(false);
    const benchmarkMenuRef = useRef(null);

    function addSelectedCommand(name) {
        setSelectedCommands((prev) => (prev.includes(name) ? prev : [...prev, name]));
    }

    function removeSelectedCommand(name) {
        setSelectedCommands((prev) => prev.filter((x) => x !== name));
    }

    function addSelectedAdminLogAction(action) {
        setSelectedAdminLogActions((prev) => (prev.includes(action) ? prev : [...prev, action]));
    }

    function removeSelectedAdminLogAction(action) {
        setSelectedAdminLogActions((prev) => prev.filter((x) => x !== action));
    }

    // Upload
    const [benchFiles, setBenchFiles] = useState(() => []);
    const [descriptionDraft, setDescriptionDraft] = useState("");
    const [selectedChecker, setSelectedChecker] = useState("select");
    const [uploadError, setUploadError] = useState(" ");
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(null);
    const fileInputRef = useRef(null);
    const [uploadLogText, setUploadLogText] = useState("");
    const [selectedParser, setSelectedParser] = useState("select");
    const [checkerTleSecondsDraft, setCheckerTleSecondsDraft] = useState("60");
    const [parserTleSecondsDraft, setParserTleSecondsDraft] = useState("60");
    const [isUploadSettingsOpen, setIsUploadSettingsOpen] = useState(false);
    const [manualApplyRows, setManualApplyRows] = useState(() => []);
    const [isManualApplyOpen, setIsManualApplyOpen] = useState(false);
    const [isManualApplying, setIsManualApplying] = useState(false);
    const [navigateNotice, setNavigateNotice] = useState("");
    const [actionPoint, setActionPoint] = useState(null);
    const [selectedTestChecker, setSelectedTestChecker] = useState(DEFAULT_CHECKER_VERSION);
    const [testingPointId, setTestingPointId] = useState(null);
    const [testingPointLabel, setTestingPointLabel] = useState("");
    const testingPointTickerRef = useRef(null);
    const testingAbortRef = useRef(null);
    const testingProgressPollRef = useRef(null);

    function mapVerifyProgressLabel(statusRaw, tleSeconds) {
        const status = String(statusRaw || "").trim().toLowerCase();
        if (status === "queued") return "Testing: queued";
        if (status === "auth") return "Testing: auth";
        if (status === "download_point") return "Testing: download point";
        if (status === "read_truth") return "Testing: read_truth";
        if (status === "cec") return `Testing: cec -T ${tleSeconds} -n`;
        if (status === "truth_to_hex") return "Testing: truth -> hex";
        if (status === "bench_to_hex") return "Testing: bench -> hex";
        if (status === "hex_compare") return "Testing: hex compare";
        if (status === "done") return "Testing: done";
        if (status === "error") return "Testing: failed";
        return "Testing...";
    }
    const maxSingleUploadBytes = Math.max(0, Number(currentCommand?.maxSingleUploadBytes || 0));
    const totalUploadQuotaBytes = Math.max(0, Number(currentCommand?.totalUploadQuotaBytes || 0));
    const uploadedBytesTotal = Math.max(0, Number(currentCommand?.uploadedBytesTotal || 0));
    const remainingUploadBytes = Math.max(0, totalUploadQuotaBytes - uploadedBytesTotal);
    const maxMultiFileBatchCount = Math.max(1, Number(currentCommand?.maxMultiFileBatchCount || MAX_MULTI_FILE_BATCH_COUNT));
    const verifyTimeoutQuotaSeconds = Math.max(1, Number(currentCommand?.abcVerifyTimeoutSeconds || 60));
    const metricsTimeoutQuotaSeconds = Math.max(1, Number(currentCommand?.abcMetricsTimeoutSeconds || 60));
    const uploadCountdownRef = useRef(null);

    const [adminUserIdDraft, setAdminUserIdDraft] = useState("");
    const [adminPanelError, setAdminPanelError] = useState("");
    const [adminUser, setAdminUser] = useState(null);
    const [adminLogs, setAdminLogs] = useState(() => []);
    const [adminLogCommandQuery, setAdminLogCommandQuery] = useState("");
    const [adminLogActionQuery, setAdminLogActionQuery] = useState("");
    const [selectedAdminLogActions, setSelectedAdminLogActions] = useState(() => []);
    const [adminSingleGbDraft, setAdminSingleGbDraft] = useState("");
    const [adminTotalGbDraft, setAdminTotalGbDraft] = useState("");
    const [adminBatchCountDraft, setAdminBatchCountDraft] = useState("");
    const [adminVerifyTleSecondsDraft, setAdminVerifyTleSecondsDraft] = useState("");
    const [adminMetricsTleSecondsDraft, setAdminMetricsTleSecondsDraft] = useState("");
    const [isAdminLoading, setIsAdminLoading] = useState(false);
    const [isAdminSaving, setIsAdminSaving] = useState(false);
    const [isAdminQuotaSettingsOpen, setIsAdminQuotaSettingsOpen] = useState(false);
    const [truthFiles, setTruthFiles] = useState(() => []);
    const truthFilesInputRef = useRef(null);
    const [isTruthUploading, setIsTruthUploading] = useState(false);
    const [truthUploadProgress, setTruthUploadProgress] = useState(null);
    const [truthUploadError, setTruthUploadError] = useState("");
    const [truthUploadLogText, setTruthUploadLogText] = useState("");
    const [truthConflicts, setTruthConflicts] = useState(() => []);
    const [isTruthConflictModalOpen, setIsTruthConflictModalOpen] = useState(false);
    const [isBulkVerifyRunning, setIsBulkVerifyRunning] = useState(false);
    const [selectedBulkVerifyChecker, setSelectedBulkVerifyChecker] = useState(DEFAULT_CHECKER_VERSION);
    const [bulkVerifyLogText, setBulkVerifyLogText] = useState("");
    const [isBulkMetricsAuditRunning, setIsBulkMetricsAuditRunning] = useState(false);
    const [bulkMetricsAuditLogText, setBulkMetricsAuditLogText] = useState("");
    const [bulkVerifyProgress, setBulkVerifyProgress] = useState(null);
    const [bulkMetricsAuditProgress, setBulkMetricsAuditProgress] = useState(null);
    const [bulkVerifyCandidates, setBulkVerifyCandidates] = useState(() => []);
    const [isBulkVerifyApplyModalOpen, setIsBulkVerifyApplyModalOpen] = useState(false);
    const bulkVerifyAbortRef = useRef(null);
    const bulkMetricsAbortRef = useRef(null);
    const isAdmin = currentCommand?.role === ROLE_ADMIN;

    // Filters (start in "test")
    const [benchmarkFilter, setBenchmarkFilter] = useState("test"); // "test" | numeric string
    const [colorMode, setColorMode] = useState("status");
    const [statusFilter, setStatusFilter] = useState({
        "non-verified": true,
        verified: true,
        failed: true,
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

    const prevBenchmarkRef = useRef(benchmarkFilter);
    useEffect(() => {
        if (prevBenchmarkRef.current !== benchmarkFilter) {
            fitViewToAllVisiblePoints();
            prevBenchmarkRef.current = benchmarkFilter;
        }
    }, [benchmarkFilter, fitViewToAllVisiblePoints]);

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

    useEffect(() => {
        let alive = true;
        const savedKey = (localStorage.getItem("bench_auth_key") || "").trim();
        const authPromise = savedKey ? fetchCommandByAuthKey(savedKey).catch(() => null) : Promise.resolve(null);
        Promise.all([fetchPoints(), fetchCommands(), authPromise])
            .then(([rows, dbCommands, authedCommand]) => {
                if (!alive) return;
                setPoints(rows);
                setCommands(dbCommands);
                if (authedCommand) {
                    setCurrentCommand(authedCommand);
                    setAuthError("");
                } else if (savedKey) {
                    localStorage.removeItem("bench_auth_key");
                    setAuthError("Saved key is no longer valid.");
                }
            })
            .catch((e) => {
                if (!alive) return;
                console.error(e);
                setAuthError(String(e?.message || "Failed to load initial data."));
            })
            .finally(() => {
                if (!alive) return;
                setIsBootstrapping(false);
            });
        return () => {
            alive = false;
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

        if (files.length === 0) {
            setUploadError(" ");
            return;
        }

        if (files.length > maxMultiFileBatchCount) {
            setUploadError(`Too many files selected. Maximum is ${maxMultiFileBatchCount}.`);
            return;
        }

        for (const file of files) {
            const parsed = parseBenchFileName(file.name);
            if (!parsed.ok) {
                setUploadError(parsed.error);
                return;
            }

            if (file.size > maxSingleUploadBytes) {
                setUploadError(`File is too large. Maximum size is ${formatGb(maxSingleUploadBytes)} GB.`);
                return;
            }
        }

        if (files.length > 1) {
            const batchBytes = files.reduce((sum, file) => sum + file.size, 0);
            if (batchBytes > remainingUploadBytes) {
                setUploadError(
                    `Multi-file quota exceeded. Remaining: ${formatGb(remainingUploadBytes)} GB.`
                );
                return;
            }
        }

        setUploadError(" ");
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

    function parseTruthFileName(fileNameRaw) {
        const fileName = String(fileNameRaw || "").trim();
        const match = fileName.match(/^bench(2\d\d)\.truth$/i);
        if (!match) {
            return {
                ok: false,
                error: "Invalid truth file name. Expected: bench{200..299}.truth",
            };
        }
        return {
            ok: true,
            benchmark: String(Number(match[1])),
            fileName,
        };
    }

    async function readCircuitFileAsText(file) {
        if (file && typeof file.text === "function") {
            return await file.text();
        }
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = () => reject(new Error("Failed to read file content."));
            reader.readAsText(file);
        });
    }

    function isRenderNonVerdictReason(reasonRaw) {
        const reason = String(reasonRaw || "").toLowerCase();
        if (!reason) return true;
        return (
            reason.includes("timed out") ||
            reason.includes("timeout") ||
            reason.includes("failed to compute metrics") ||
            reason.includes("body too large") ||
            reason.includes("failed to fetch") ||
            reason.includes("network")
        );
    }

    function normalizeParserResultRow(row, fallbackParsed) {
        if (!row) {
            return {
                kind: "non-verdict",
                reason: "Render parser response is missing.",
                parsed: fallbackParsed,
                changed: false,
            };
        }
        const expectedDelay = Number(row?.expected?.delay);
        const expectedArea = Number(row?.expected?.area);
        const actualDelay = Number(row?.actual?.delay);
        const actualArea = Number(row?.actual?.area);
        const hasExpected = Number.isFinite(expectedDelay) && Number.isFinite(expectedArea);
        const hasActual = Number.isFinite(actualDelay) && Number.isFinite(actualArea);
        const isParetoBetterOrEqual = hasExpected && hasActual && actualDelay <= expectedDelay && actualArea <= expectedArea;

        if (row.ok && isParetoBetterOrEqual && (Boolean(row?.adjusted) || actualDelay !== expectedDelay || actualArea !== expectedArea)) {
            return {
                kind: "pass-adjusted",
                reason: row.reason || `Parser adjusted metrics to delay=${actualDelay}, area=${actualArea}.`,
                parsed: {
                    ...fallbackParsed,
                    delay: actualDelay,
                    area: actualArea,
                },
                changed: actualDelay !== fallbackParsed.delay || actualArea !== fallbackParsed.area,
            };
        }

        if (row.ok) {
            return {
                kind: "pass",
                reason: "Parser matched filename metrics.",
                parsed: fallbackParsed,
                changed: false,
            };
        }

        if (hasExpected && hasActual && actualDelay <= expectedDelay && actualArea <= expectedArea) {
            return {
                kind: "pass-adjusted",
                reason: `Parser adjusted metrics to delay=${actualDelay}, area=${actualArea}.`,
                parsed: {
                    ...fallbackParsed,
                    delay: actualDelay,
                    area: actualArea,
                },
                changed: actualDelay !== fallbackParsed.delay || actualArea !== fallbackParsed.area,
            };
        }

        if (hasExpected && hasActual) {
            return {
                kind: "failed",
                reason: row.reason || "Metric mismatch.",
                parsed: fallbackParsed,
                changed: false,
            };
        }

        if (isRenderNonVerdictReason(row.reason)) {
            return {
                kind: "non-verdict",
                reason: row.reason || "Parser did not return verdict.",
                parsed: fallbackParsed,
                changed: false,
            };
        }

        return {
            kind: "failed",
            reason: row.reason || "Parser validation failed.",
            parsed: fallbackParsed,
            changed: false,
        };
    }

    function clearTruthFileInput() {
        setTruthFiles([]);
        if (truthFilesInputRef.current) truthFilesInputRef.current.value = "";
    }

    function getPointDownloadUrl(p) {
        if (!p || !p.fileName || p.benchmark === "test") return null;
        if (p.downloadUrl) return p.downloadUrl;
        return null;
    }

    function canDeletePoint(p) {
        if (!p) return false;
        if (p.benchmark === "test") return true;
        return Boolean(currentCommand && p.sender === currentCommand.name);
    }

    function canTestPoint(p) {
        if (!p || p.benchmark === "test") return false;
        return Boolean(currentCommand);
    }

    async function downloadCircuit(p) {
        const url = getPointDownloadUrl(p);
        if (!url) {
            window.alert("File does not exist.");
            return;
        }

        const a = document.createElement("a");
        a.href = url;
        a.download = p.fileName || "circuit.bench";
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    async function createPointFromUploadedFile(sourceFile, parsed, description, verificationResult = null) {
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
        });
        const putRes = await fetch(uploadMeta.uploadUrl, {
            method: "PUT",
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

        const savedPayload = await savePoint({
            ...point,
            authKey: authKeyDraft,
            fileSize: sourceFile.size,
            batchSize,
        });

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
        if (ENABLED_CHECKERS.has(selectedChecker) && checkerTimeoutSeconds === null) {
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

        try {
            const parserEnabled = selectedParser === "ABC";
            const checkerEnabled = ENABLED_CHECKERS.has(selectedChecker);
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

            const autoRows = [];
            const manualRowsDraft = [];
            const logRows = [];

            for (const item of preparedFiles) {
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
                        });
                        const parserRows = Array.isArray(parserResult?.files) ? parserResult.files : [];
                        const parserRow = parserRows[0] || { ok: true, fileName: normalizedInputFileName };
                        parserState = normalizeParserResultRow(parserRow, item.parsed);
                    } catch (validationError) {
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
                if (checkerEnabled) {
                    checkerVersion = selectedChecker;
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
                            checkerVersion: selectedChecker,
                            applyStatus: false,
                            timeoutSeconds: checkerTimeoutSeconds,
                        });
                        checkerVerdict = verified?.status === "verified";
                    } catch {
                        checkerVerdict = null;
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

                setUploadProgress((prev) => {
                    if (!prev) return prev;
                    const verifiedDelta = finalStatus === "verified" ? 1 : 0;
                    return {
                        ...prev,
                        done: Math.min(prev.total, prev.done + 1),
                        verified: Math.min(prev.total, Number(prev.verified || 0) + verifiedDelta),
                    };
                });

                if (finalStatus !== "verified") {
                    manualRowsDraft.push({
                        key: `${item.file.name}:${item.file.size}:${manualRowsDraft.length}`,
                        checked: true,
                        delay: parserState.parsed.delay,
                        area: parserState.parsed.area,
                        verdict: finalStatus,
                        candidate,
                    });
                    continue;
                }

                autoRows.push({
                    fileName: normalizedInputFileName,
                    candidate,
                });
            }

            const savedPoints = [];
            for (const row of autoRows) {
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
                    const saved = await createPointFromUploadedFile(row.candidate.file, row.candidate.parsed, description, row.candidate.verificationResult);
                    savedPoints.push(saved);
                    logRows.push({
                        fileName,
                        success: true,
                        reason: "Uploaded successfully.",
                    });
                } catch (err) {
                    logRows.push({
                        fileName,
                        success: false,
                        reason: err?.message || "Failed to upload point.",
                    });
                }
            }

            if (manualRowsDraft.length > 0) {
                setManualApplyRows(manualRowsDraft);
                setIsManualApplyOpen(true);
            }

            if (savedPoints.length > 0) {
                setPoints((prev) => [...savedPoints.reverse(), ...prev]);
                const latestSaved = savedPoints[savedPoints.length - 1];
                setLastAddedId(latestSaved.id);
                setBenchmarkFilter(String(latestSaved.benchmark));
            }

            if (benchFiles.length >= 2) {
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
            setUploadError(err?.message || "Failed to upload point.");
        } finally {
            stopUploadCountdown();
            setIsUploading(false);
            setUploadProgress(null);
        }
    }

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

    async function deletePointById(id) {
        const p = points.find((x) => x.id === id);
        if (!p) return false;

        if (p?.benchmark === "test") {
            setPoints((prev) => prev.filter((x) => x.id !== id));
            if (lastAddedId === id) setLastAddedId(null);
            return true;
        }

        try {
            await deletePoint({ id, authKey: authKeyDraft });
        } catch (error) {
            window.alert(error?.message || "Failed to delete point.");
            return false;
        }

        setPoints((prev) => prev.filter((x) => x.id !== id));
        if (lastAddedId === id) setLastAddedId(null);
        return true;
    }

    function openPointActionModal(pointId) {
        const p = points.find((x) => x.id === pointId);
        if (!p) return;
        setActionPoint(p);
    }

    function closePointActionModal() {
        setActionPoint(null);
    }

    async function confirmAndDeletePoint(pointId) {
        const p = points.find((x) => x.id === pointId);
        if (!p || !canDeletePoint(p)) return false;
        if (!window.confirm(`Delete ${p.fileName}?`)) return false;
        return await deletePointById(pointId);
    }

    async function onTestPoint(point, checkerVersionRaw = selectedTestChecker) {
        if (!canTestPoint(point)) return;
        if (testingPointId && testingPointId === point.id && testingAbortRef.current) {
            testingAbortRef.current.abort();
            testingAbortRef.current = null;
            if (testingPointTickerRef.current) clearInterval(testingPointTickerRef.current);
            testingPointTickerRef.current = null;
            if (testingProgressPollRef.current) clearInterval(testingProgressPollRef.current);
            testingProgressPollRef.current = null;
            setTestingPointLabel("");
            setTestingPointId(null);
            return;
        }
        if (testingAbortRef.current) {
            testingAbortRef.current.abort();
            testingAbortRef.current = null;
        }
        if (testingPointTickerRef.current) clearInterval(testingPointTickerRef.current);
        testingPointTickerRef.current = null;
        if (testingProgressPollRef.current) clearInterval(testingProgressPollRef.current);
        testingProgressPollRef.current = null;
        setTestingPointId(point.id);
        setTestingPointLabel("Testing: queued");
        const controller = new AbortController();
        testingAbortRef.current = controller;
        const progressToken = uid();
        testingProgressPollRef.current = setInterval(async () => {
            if (controller.signal.aborted) return;
            try {
                const progress = await fetchVerifyPointProgress({ token: progressToken, signal: controller.signal });
                setTestingPointLabel(mapVerifyProgressLabel(progress?.status, verifyTimeoutQuotaSeconds));
            } catch {
                // ignore transient poll failures
            }
        }, 500);
        const canApplyStatus =
            point.sender === currentCommand?.name || currentCommand?.role === ROLE_ADMIN;
        const checkerVersion = ENABLED_CHECKERS.has(checkerVersionRaw) ? checkerVersionRaw : DEFAULT_CHECKER_VERSION;
        try {
            const result = await verifyPointCircuit({
                authKey: authKeyDraft,
                pointId: point.id,
                applyStatus: canApplyStatus,
                checkerVersion,
                signal: controller.signal,
                progressToken,
            });
            const scriptText = String(result?.script || "").trim();
            const commandInfo = isAdmin && scriptText ? `\n\nServer command:\n${scriptText}` : "";
            if (canApplyStatus) {
                setPoints((prev) =>
                    prev.map((row) =>
                        row.id === point.id
                            ? {
                                ...row,
                                status: result.status,
                                checkerVersion: result.checkerVersion,
                            }
                            : row
                    )
                );
                window.alert(
                    result.equivalent
                        ? `Checker: equivalent. Status updated to verified.${commandInfo}`
                        : `Checker: not equivalent. Status updated to failed.${commandInfo}`
                );
            } else {
                window.alert(
                    result.equivalent
                        ? `Checker: equivalent. Status was not changed.${commandInfo}`
                        : `Checker: not equivalent. Status was not changed.${commandInfo}`
                );
            }
        } catch (error) {
            if (error?.name === "AbortError") return;
            window.alert(error?.message || "Failed to run checker.");
        } finally {
            if (testingAbortRef.current === controller) {
                testingAbortRef.current = null;
            }
            if (testingPointTickerRef.current) clearInterval(testingPointTickerRef.current);
            testingPointTickerRef.current = null;
            if (testingProgressPollRef.current) clearInterval(testingProgressPollRef.current);
            testingProgressPollRef.current = null;
            setTestingPointLabel("");
            setTestingPointId(null);
        }
    }

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

        const lines = [header];
        for (let bench = 200; bench <= 299; bench += 1) {
            const row = [String(bench)];
            for (let delay = 1; delay <= maxDelay; delay += 1) {
                const value = minAreaByBenchDelay.get(`${bench}:${delay}`);
                row.push(value === undefined ? "" : String(value));
            }
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

    const uploadDisabledReason = (() => {
        if (isUploading) return "Upload is already in progress.";
        if (benchFiles.length === 0) return "No files selected.";
        if (selectedChecker === "select" || selectedParser === "select") {
            return "Please configure checker and parser in settings.";
        }
        if (ENABLED_CHECKERS.has(selectedChecker) && parseCheckerTimeoutSeconds() === null) {
            return `Checker TLE must be an integer from 1 to ${verifyTimeoutQuotaSeconds} seconds.`;
        }
        if (selectedParser === "ABC" && parseParserTimeoutSeconds() === null) {
            return `Parser TLE must be an integer from 1 to ${metricsTimeoutQuotaSeconds} seconds.`;
        }
        if (benchFiles.length > maxMultiFileBatchCount) {
            return `Too many files selected. Maximum is ${maxMultiFileBatchCount}.`;
        }
        for (const file of benchFiles) {
            const parsed = parseBenchFileName(file.name);
            if (!parsed.ok) return parsed.error;
            if (file.size > maxSingleUploadBytes) {
                return `File is too large. Maximum size is ${formatGb(maxSingleUploadBytes)} GB.`;
            }
        }
        if (benchFiles.length > 1) {
            const batchBytes = benchFiles.reduce((sum, file) => sum + file.size, 0);
            if (batchBytes > remainingUploadBytes) {
                return `Multi-file quota exceeded. Remaining: ${formatGb(remainingUploadBytes)} GB.`;
            }
        }
        const description = normalizeDescriptionForSubmit();
        if (description.length > MAX_DESCRIPTION_LEN) {
            return `Description is too long (max ${MAX_DESCRIPTION_LEN}).`;
        }
        return "";
    })();

    const canAdd = uploadDisabledReason === "";

    useEffect(() => {
        const suggestedChecker = String(verifyTimeoutQuotaSeconds);
        setCheckerTleSecondsDraft((prev) => {
            const parsed = Number(prev);
            if (Number.isFinite(parsed) && parsed >= 1 && parsed <= verifyTimeoutQuotaSeconds) return prev;
            return suggestedChecker;
        });
    }, [verifyTimeoutQuotaSeconds]);

    useEffect(() => {
        const suggestedParser = String(metricsTimeoutQuotaSeconds);
        setParserTleSecondsDraft((prev) => {
            const parsed = Number(prev);
            if (Number.isFinite(parsed) && parsed >= 1 && parsed <= metricsTimeoutQuotaSeconds) return prev;
            return suggestedParser;
        });
    }, [metricsTimeoutQuotaSeconds]);

    useEffect(() => {
        return () => {
            stopUploadCountdown();
            if (testingAbortRef.current) {
                testingAbortRef.current.abort();
                testingAbortRef.current = null;
            }
            if (bulkVerifyAbortRef.current) {
                bulkVerifyAbortRef.current.abort();
                bulkVerifyAbortRef.current = null;
            }
            if (bulkMetricsAbortRef.current) {
                bulkMetricsAbortRef.current.abort();
                bulkMetricsAbortRef.current = null;
            }
            if (testingPointTickerRef.current) clearInterval(testingPointTickerRef.current);
            testingPointTickerRef.current = null;
            if (testingProgressPollRef.current) clearInterval(testingProgressPollRef.current);
            testingProgressPollRef.current = null;
        };
    }, []);

    const refreshAdminLogs = useCallback(async () => {
        if (!isAdmin) return;
        const commandNameById = new Map(commands.map((cmd) => [Number(cmd.id), String(cmd.name || "")]));
        const normalizeLogRows = (rows) =>
            rows.map((log) => {
                const commandId = Number(log?.commandId);
                const fallbackName = commandNameById.get(commandId) || "";
                return {
                    ...log,
                    commandId,
                    targetName: String(log?.targetName || fallbackName || ""),
                };
            });
        try {
            let globalLogs = [];
            try {
                const payload = await fetchAdminActionLogs({ authKey: authKeyDraft, limit: 1000 });
                globalLogs = normalizeLogRows(Array.isArray(payload?.actionLogs) ? payload.actionLogs : []);
            } catch (error) {
                console.error(error);
            }
            if (globalLogs.length > 0) {
                setAdminLogs(globalLogs);
                return;
            }

            // Fallback for environments where global logs endpoint is unavailable:
            // collect user-scoped logs and merge them.
            if (!Array.isArray(commands) || commands.length === 0) {
                setAdminLogs([]);
                return;
            }
            const perUserPayloads = await Promise.all(
                commands.map((cmd) => fetchAdminUserById({ authKey: authKeyDraft, userId: cmd.id }).catch(() => null))
            );
            const merged = [];
            const seen = new Set();
            for (const item of perUserPayloads) {
                const logs = Array.isArray(item?.actionLogs) ? item.actionLogs : [];
                for (const rawLog of normalizeLogRows(logs)) {
                    const log = rawLog;
                    const id = Number(log?.id);
                    if (Number.isFinite(id) && seen.has(id)) continue;
                    if (Number.isFinite(id)) seen.add(id);
                    merged.push(log);
                }
            }
            merged.sort((a, b) => {
                const ta = Date.parse(String(a?.createdAt || "")) || 0;
                const tb = Date.parse(String(b?.createdAt || "")) || 0;
                return tb - ta;
            });
            setAdminLogs(merged);
        } catch (error) {
            console.error(error);
            setAdminLogs([]);
        }
    }, [authKeyDraft, commands, isAdmin]);

    useEffect(() => {
        if (!isAdmin) {
            setAdminLogs([]);
            return;
        }
        refreshAdminLogs();
    }, [isAdmin, refreshAdminLogs]);

    async function loadAdminUser() {
        if (!currentCommand || currentCommand.role !== ROLE_ADMIN) return;

        const userId = Number(adminUserIdDraft);
        if (!Number.isInteger(userId) || userId < 1) {
            setAdminPanelError("Enter a valid numeric user id.");
            return;
        }

        setIsAdminLoading(true);
        setAdminPanelError("");
        try {
            const payload = await fetchAdminUserById({ authKey: authKeyDraft, userId });
            setAdminUser(payload.user);
            setAdminSingleGbDraft(formatGb(payload.user?.maxSingleUploadBytes || 0));
            setAdminTotalGbDraft(formatGb(payload.user?.totalUploadQuotaBytes || 0));
            setAdminBatchCountDraft(String(payload.user?.maxMultiFileBatchCount || MAX_MULTI_FILE_BATCH_COUNT));
            setAdminVerifyTleSecondsDraft(String(payload.user?.abcVerifyTimeoutSeconds || 60));
            setAdminMetricsTleSecondsDraft(String(payload.user?.abcMetricsTimeoutSeconds || 60));
            refreshAdminLogs();
        } catch (error) {
            setAdminUser(null);
            setAdminPanelError(error?.message || "Failed to load user.");
        } finally {
            setIsAdminLoading(false);
        }
    }

    async function saveAdminUserSettings() {
        if (!adminUser) return;
        setIsAdminSaving(true);
        setAdminPanelError("");
        try {
            const payload = await updateAdminUserUploadSettings({
                authKey: authKeyDraft,
                userId: adminUser.id,
                maxSingleUploadGb: adminSingleGbDraft,
                totalUploadQuotaGb: adminTotalGbDraft,
                maxMultiFileBatchCount: adminBatchCountDraft,
                abcVerifyTimeoutSeconds: adminVerifyTleSecondsDraft,
                abcMetricsTimeoutSeconds: adminMetricsTleSecondsDraft,
            });
            setAdminUser(payload.user);
            setAdminSingleGbDraft(formatGb(payload.user?.maxSingleUploadBytes || 0));
            setAdminTotalGbDraft(formatGb(payload.user?.totalUploadQuotaBytes || 0));
            setAdminBatchCountDraft(String(payload.user?.maxMultiFileBatchCount || MAX_MULTI_FILE_BATCH_COUNT));
            setAdminVerifyTleSecondsDraft(String(payload.user?.abcVerifyTimeoutSeconds || 60));
            setAdminMetricsTleSecondsDraft(String(payload.user?.abcMetricsTimeoutSeconds || 60));
            refreshAdminLogs();
        } catch (error) {
            setAdminPanelError(error?.message || "Failed to save settings.");
        } finally {
            setIsAdminSaving(false);
        }
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

    function toTruthLogText(rows) {
        return rows
            .map((row) => `file=${row.fileName}; success=${row.success ? "true" : "false"}; reason=${row.reason}`)
            .join("\n");
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

    function appendTextLog(setter, line) {
        setter((prev) => (prev ? `${prev}\n${line}` : line));
    }

    function mapServerStepLabel(statusRaw, { verifySeconds = null } = {}) {
        const status = String(statusRaw || "").toLowerCase();
        if (status === "queued") return "queued";
        if (status === "auth") return "auth";
        if (status === "download_point") return "download point";
        if (status === "read_truth") return "read_truth";
        if (status === "cec") return verifySeconds ? `cec -T ${verifySeconds} -n` : "cec";
        if (status === "truth_to_hex") return "truth -> hex";
        if (status === "bench_to_hex") return "bench -> hex";
        if (status === "hex_compare") return "hex compare";
        if (status === "metrics") return "read_bench; strash; ps";
        if (status === "done") return "done";
        if (status === "error") return "failed";
        return status || "running";
    }

    async function runBulkVerifyAllPoints(checkerVersionRaw = selectedBulkVerifyChecker) {
        if (bulkVerifyAbortRef.current) return;
        const checkerVersion = ENABLED_CHECKERS.has(checkerVersionRaw) ? checkerVersionRaw : DEFAULT_CHECKER_VERSION;
        const controller = new AbortController();
        bulkVerifyAbortRef.current = controller;
        setIsBulkVerifyRunning(true);
        const targetPoints = points.filter((p) => p.benchmark !== "test");
        setBulkVerifyProgress({ done: 0, total: targetPoints.length });
        setAdminPanelError("");
        setBulkVerifyLogText("");
        try {
            const rows = [];
            for (const point of targetPoints) {
                if (controller.signal.aborted) break;
                const progressToken = uid();
                let pollTimer = null;
                let lastStep = "";
                const emitStep = (step) => {
                    if (!step || step === lastStep) return;
                    lastStep = step;
                    appendTextLog(
                        setBulkVerifyLogText,
                        `file=${point.fileName}; success=false; reason=checker: ${mapServerStepLabel(step, { verifySeconds: verifyTimeoutQuotaSeconds })}`
                    );
                };
                pollTimer = setInterval(async () => {
                    try {
                        const progress = await fetchVerifyPointProgress({ token: progressToken, signal: controller.signal });
                        emitStep(progress?.status);
                    } catch {
                        // Ignore polling errors while request is running.
                    }
                }, 450);
                let row = null;
                try {
                    row = await runAdminBulkVerifyPoint({
                        authKey: authKeyDraft,
                        checkerVersion,
                        pointId: point.id,
                        signal: controller.signal,
                        progressToken,
                    });
                } finally {
                    if (pollTimer) clearInterval(pollTimer);
                }
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
        try {
            const mismatches = [];
            for (const point of targetPoints) {
                if (controller.signal.aborted) break;
                const progressToken = uid();
                let pollTimer = null;
                let lastStep = "";
                const emitStep = (step) => {
                    if (!step || step === lastStep) return;
                    lastStep = step;
                    appendTextLog(
                        setBulkMetricsAuditLogText,
                        `file=${point.fileName}; success=false; reason=parser: ${mapServerStepLabel(step)}`
                    );
                };
                pollTimer = setInterval(async () => {
                    try {
                        const progress = await fetchVerifyPointProgress({ token: progressToken, signal: controller.signal });
                        emitStep(progress?.status);
                    } catch {
                        // Ignore polling errors while request is running.
                    }
                }, 450);
                let mismatch = null;
                try {
                    mismatch = await runAdminMetricsAuditPoint({
                        authKey: authKeyDraft,
                        pointId: point.id,
                        signal: controller.signal,
                        progressToken,
                    });
                } finally {
                    if (pollTimer) clearInterval(pollTimer);
                }
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
            const checkerVersion = ENABLED_CHECKERS.has(selectedBulkVerifyChecker)
                ? selectedBulkVerifyChecker
                : DEFAULT_CHECKER_VERSION;
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

    function downloadUploadLog() {
        if (!uploadLogText) return;
        const blob = new Blob([uploadLogText], { type: "text/plain;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `upload-log-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    function downloadTruthUploadLog() {
        if (!truthUploadLogText) return;
        const blob = new Blob([truthUploadLogText], { type: "text/plain;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `truth-upload-log-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    function downloadBulkVerifyLog() {
        if (!bulkVerifyLogText) return;
        const blob = new Blob([bulkVerifyLogText], { type: "text/plain;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `bulk-check-log-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    function downloadBulkMetricsAuditLog() {
        if (!bulkMetricsAuditLogText) return;
        const blob = new Blob([bulkMetricsAuditLogText], { type: "text/plain;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `bulk-metrics-audit-log-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
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
        setSentPage(1);
    }, [myPoints.length]);

    const selectedAdminLogActionSet = useMemo(() => new Set(selectedAdminLogActions), [selectedAdminLogActions]);
    const availableAdminLogActions = useMemo(() => {
        const actions = new Set();
        for (const log of adminLogs) {
            if (log?.action) actions.add(String(log.action));
        }
        return Array.from(actions).sort((a, b) => a.localeCompare(b));
    }, [adminLogs]);
    const filteredAdminLogs = useMemo(() => {
        const query = adminLogCommandQuery.trim().toLowerCase();
        if (!query && selectedAdminLogActionSet.size === 0) return adminLogs;
        return adminLogs.filter((log) => {
            const targetName = String(log?.targetName || "").toLowerCase();
            if (query && !targetName.startsWith(query)) return false;
            if (selectedAdminLogActionSet.size > 0 && !selectedAdminLogActionSet.has(String(log?.action || ""))) {
                return false;
            }
            return true;
        });
    }, [adminLogs, adminLogCommandQuery, selectedAdminLogActionSet]);
    const adminLogsPreview = useMemo(() => filteredAdminLogs.slice(0, 3), [filteredAdminLogs]);
    const adminLogsHasMore = filteredAdminLogs.length > adminLogsPreview.length;

    useEffect(() => {
        if (!navigateNotice) return;
        const t = setTimeout(() => setNavigateNotice(""), 3200);
        return () => clearTimeout(t);
    }, [navigateNotice]);

    useEffect(() => {
        if (!benchmarkMenuOpen) return;
        function onDocMouseDown(e) {
            if (!benchmarkMenuRef.current) return;
            if (!benchmarkMenuRef.current.contains(e.target)) {
                setBenchmarkMenuOpen(false);
            }
        }
        document.addEventListener("mousedown", onDocMouseDown);
        return () => document.removeEventListener("mousedown", onDocMouseDown);
    }, [benchmarkMenuOpen]);

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
                        onSelectBenchmark={(benchmark) => {
                            setBenchmarkFilter(benchmark);
                            setBenchmarkMenuOpen(false);
                        }}
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
                        isUploading={isUploading}
                        uploadProgress={uploadProgress}
                        uploadLogText={uploadLogText}
                        onDownloadUploadLog={downloadUploadLog}
                        selectedChecker={selectedChecker}
                        onSelectedCheckerChange={setSelectedChecker}
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
                        uploadDisabledReason={uploadDisabledReason}
                    />

                    {isAdmin ? (
                        <AdminSettingsSection
                            adminUserIdDraft={adminUserIdDraft}
                            onAdminUserIdDraftChange={setAdminUserIdDraft}
                            loadAdminUser={loadAdminUser}
                            isAdminLoading={isAdminLoading}
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
                            stopBulkVerifyAllPoints={stopBulkVerifyAllPoints}
                            isBulkVerifyRunning={isBulkVerifyRunning}
                            bulkVerifyProgress={bulkVerifyProgress}
                            bulkVerifyLogText={bulkVerifyLogText}
                            onDownloadBulkVerifyLog={downloadBulkVerifyLog}
                            runBulkMetricsAudit={runBulkMetricsAudit}
                            stopBulkMetricsAudit={stopBulkMetricsAudit}
                            isBulkMetricsAuditRunning={isBulkMetricsAuditRunning}
                            bulkMetricsAuditProgress={bulkMetricsAuditProgress}
                            bulkMetricsAuditLogText={bulkMetricsAuditLogText}
                            onDownloadBulkMetricsAuditLog={downloadBulkMetricsAuditLog}
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

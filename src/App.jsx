// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { useEffect, useMemo, useRef, useState } from "react";
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
    deletePoint,
    fetchAdminUserById,
    fetchCommandByAuthKey,
    fetchCommands,
    fetchPoints,
    requestUploadUrl,
    savePoint,
    updateAdminUserUploadSettings,
} from "./services/apiClient.js";

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

    // Upload
    const [benchFiles, setBenchFiles] = useState(() => []);
    const [descriptionDraft, setDescriptionDraft] = useState("");
    const [uploadError, setUploadError] = useState(" ");
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(null);
    const fileInputRef = useRef(null);
    const [uploadLogText, setUploadLogText] = useState("");
    const [navigateNotice, setNavigateNotice] = useState("");
    const [actionPoint, setActionPoint] = useState(null);
    const maxSingleUploadBytes = Math.max(0, Number(currentCommand?.maxSingleUploadBytes || 0));
    const totalUploadQuotaBytes = Math.max(0, Number(currentCommand?.totalUploadQuotaBytes || 0));
    const uploadedBytesTotal = Math.max(0, Number(currentCommand?.uploadedBytesTotal || 0));
    const remainingUploadBytes = Math.max(0, totalUploadQuotaBytes - uploadedBytesTotal);
    const maxMultiFileBatchCount = Math.max(1, Number(currentCommand?.maxMultiFileBatchCount || MAX_MULTI_FILE_BATCH_COUNT));

    const [adminUserIdDraft, setAdminUserIdDraft] = useState("");
    const [adminPanelError, setAdminPanelError] = useState("");
    const [adminUser, setAdminUser] = useState(null);
    const [adminLogs, setAdminLogs] = useState(() => []);
    const [adminSingleGbDraft, setAdminSingleGbDraft] = useState("");
    const [adminTotalGbDraft, setAdminTotalGbDraft] = useState("");
    const [adminBatchCountDraft, setAdminBatchCountDraft] = useState("");
    const [isAdminLoading, setIsAdminLoading] = useState(false);
    const [isAdminSaving, setIsAdminSaving] = useState(false);

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

    // When switching to test benchmark, expand view to 50 / 1000
    useEffect(() => {
        if (benchmarkFilter === "test") {
            setDelayMax(50);
            setAreaMax(1000);
            setDelayMaxDraft("50");
            setAreaMaxDraft("1000");
        }
    }, [benchmarkFilter]);

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

    async function downloadCircuit(p) {
        const url = getPointDownloadUrl(p);
        if (!url) {
            window.alert("File does not exist.");
            return;
        }

        try {
            const headRes = await fetch(url, { method: "HEAD" });
            if (!headRes.ok) {
                window.alert("File does not exist.");
                return;
            }
        } catch {
            window.alert("File does not exist.");
            return;
        }

        const a = document.createElement("a");
        a.href = url;
        a.download = p.fileName || "circuit.bench";
        a.rel = "noopener noreferrer";
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    async function createPointFromUploadedFile(sourceFile, parsed, description) {
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
            batchSize: benchFiles.length,
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
            status: "non-verified",
            checkerVersion: null,
        };

        const savedPayload = await savePoint({
            ...point,
            authKey: authKeyDraft,
            fileSize: sourceFile.size,
            batchSize: benchFiles.length,
        });

        if (savedPayload?.quota) {
            setCurrentCommand((prev) => (prev ? { ...prev, ...savedPayload.quota } : prev));
        }

        return savedPayload?.point || point;
    }

    async function addPointFromFile(e) {
        e.preventDefault();
        if (benchFiles.length === 0) return;
        if (benchFiles.length > maxMultiFileBatchCount) {
            setUploadError(`Too many files selected. Maximum is ${maxMultiFileBatchCount}.`);
            return;
        }

        const description = normalizeDescriptionForSubmit();
        if (description.length > MAX_DESCRIPTION_LEN) {
            setUploadError(`Description is too long (max ${MAX_DESCRIPTION_LEN}).`);
            return;
        }

        setIsUploading(true);
        setUploadProgress({ done: 0, total: benchFiles.length });
        setUploadLogText("");

        try {
            const savedPoints = [];
            const logRows = [];

            for (const file of benchFiles) {
                const parsed = parseBenchFileName(file.name);
                if (!parsed.ok) {
                    logRows.push({
                        fileName: file.name,
                        success: false,
                        reason: parsed.error,
                    });
                    setUploadProgress((prev) => {
                        if (!prev) return prev;
                        return { ...prev, done: prev.done + 1 };
                    });
                    continue;
                }

                if (file.size > maxSingleUploadBytes) {
                    logRows.push({
                        fileName: file.name,
                        success: false,
                        reason: `File is too large. Maximum size is ${formatGb(maxSingleUploadBytes)} GB.`,
                    });
                    setUploadProgress((prev) => {
                        if (!prev) return prev;
                        return { ...prev, done: prev.done + 1 };
                    });
                    continue;
                }

                try {
                    const saved = await createPointFromUploadedFile(file, parsed, description);
                    savedPoints.push(saved);
                    logRows.push({
                        fileName: file.name,
                        success: true,
                        reason: "Uploaded successfully.",
                    });
                } catch (err) {
                    logRows.push({
                        fileName: file.name,
                        success: false,
                        reason: err?.message || "Failed to upload point.",
                    });
                }
                setUploadProgress((prev) => {
                    if (!prev) return prev;
                    return { ...prev, done: prev.done + 1 };
                });
            }

            if (benchFiles.length > 1) {
                const batchBytes = benchFiles.reduce((sum, file) => sum + file.size, 0);
                if (batchBytes > remainingUploadBytes) {
                    setUploadError(
                        `Multi-file quota exceeded. Remaining: ${formatGb(remainingUploadBytes)} GB.`
                    );
                    return;
                }
            }

            if (savedPoints.length > 0) {
                setPoints((prev) => [...savedPoints.reverse(), ...prev]);
                const latestSaved = savedPoints[savedPoints.length - 1];
                setLastAddedId(latestSaved.id);
                setBenchmarkFilter(String(latestSaved.benchmark));
            }

            if (benchFiles.length >= 2) {
                const lines = logRows.map(
                    (row) =>
                        `file=${row.fileName}; success=${row.success ? "true" : "false"}; reason=${row.reason}`
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
            setIsUploading(false);
            setUploadProgress(null);
        }
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
        const header = ["Benchmark", "Delay", "Area", "Status", "CheckerVersion", "Sender"];
        const lines = [header];
        for (const p of rows) {
            const checkerVersion = p.status === "non-verified" ? "null" : (p.checkerVersion || "");
            lines.push([
                String(p.benchmark),
                String(p.delay),
                String(p.area),
                String(p.status),
                checkerVersion,
                String(p.sender),
            ]);
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

    const canAdd =
        benchFiles.length > 0 &&
        !isUploading &&
        (() => {
            if (benchFiles.length > maxMultiFileBatchCount) return false;
            for (const file of benchFiles) {
                const parsed = parseBenchFileName(file.name);
                if (!parsed.ok) return false;
                if (file.size > maxSingleUploadBytes) return false;
            }
            if (benchFiles.length > 1) {
                const batchBytes = benchFiles.reduce((sum, file) => sum + file.size, 0);
                if (batchBytes > remainingUploadBytes) return false;
            }
            const description = normalizeDescriptionForSubmit();
            if (description.length > MAX_DESCRIPTION_LEN) return false;
            return true;
        })();

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
            setAdminLogs(payload.actionLogs);
            setAdminSingleGbDraft(formatGb(payload.user?.maxSingleUploadBytes || 0));
            setAdminTotalGbDraft(formatGb(payload.user?.totalUploadQuotaBytes || 0));
            setAdminBatchCountDraft(String(payload.user?.maxMultiFileBatchCount || MAX_MULTI_FILE_BATCH_COUNT));
        } catch (error) {
            setAdminUser(null);
            setAdminLogs([]);
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
            });
            setAdminUser(payload.user);
            setAdminLogs(payload.actionLogs);
            setAdminSingleGbDraft(formatGb(payload.user?.maxSingleUploadBytes || 0));
            setAdminTotalGbDraft(formatGb(payload.user?.totalUploadQuotaBytes || 0));
            setAdminBatchCountDraft(String(payload.user?.maxMultiFileBatchCount || MAX_MULTI_FILE_BATCH_COUNT));
        } catch (error) {
            setAdminPanelError(error?.message || "Failed to save settings.");
        } finally {
            setIsAdminSaving(false);
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
    const isAdmin = currentCommand?.role === ROLE_ADMIN;
    const benchmarkLabel = benchmarkFilter === "test" ? "test" : String(benchmarkFilter);

    return (
        <div className="page">
            <header className="topbar">
                <div className="brand">
                    <div className="title">Bench points</div>
                    <div className="subtitle">Upload .bench files → points are created automatically</div>
                </div>

                <div className="topbarRight">
                    <div className="hello">
                        <span>Hello,</span>
                        <b className="helloName">{currentCommand.name}</b>
                        <span>!</span>
                    </div>
                    <div className="pill subtle">role: {getRoleLabel(currentCommand?.role)}</div>
                    <span className="dot" style={{ background: currentCommand.color }} />
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
                            saveAdminUserSettings={saveAdminUserSettings}
                            isAdminSaving={isAdminSaving}
                            adminLogs={adminLogs}
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
                canDeletePoint={canDeletePoint}
                confirmAndDeletePoint={confirmAndDeletePoint}
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

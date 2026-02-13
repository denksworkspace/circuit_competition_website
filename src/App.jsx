import { useEffect, useMemo, useRef, useState } from "react";
import {
    ResponsiveContainer,
    ScatterChart,
    Scatter,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ReferenceLine,
} from "recharts";
import "./App.css";
import {
    DEFAULT_TEST_COMMAND_COUNT,
    DELETE_PREVIEW_LIMIT,
    DIVISIONS,
    MAX_ADMIN_BATCH_BYTES,
    MAX_DESCRIPTION_LEN,
    MAX_INPUT_FILENAME_LEN,
    MAX_UPLOAD_BYTES,
    MAX_VALUE,
    ROLE_ADMIN,
    STATUS_LIST,
} from "./constants/appConstants.js";
import { CustomTooltip } from "./components/CustomTooltip.jsx";
import { Diamond } from "./components/Diamond.jsx";
import { TenPowNine } from "./components/TenPowNine.jsx";
import {
    buildAxis,
    buildStoredFileName,
    commandColor,
    computeParetoFrontOriginal,
    computePlottedPoint,
    getRoleLabel,
    parseBenchFileName,
    statusColor,
    uid,
} from "./utils/pointUtils.js";
import { clamp, formatIntNoGrouping, parsePosIntCapped } from "./utils/numberUtils.js";
import { chooseAreaSmartFromParetoFront, randInt, randomChoice } from "./utils/testPointUtils.js";
import {
    deletePoint,
    fetchCommandByAuthKey,
    fetchCommands,
    fetchPoints,
    requestUploadUrl,
    savePoint,
} from "./services/apiClient.js";

export default function App() {
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
    const maxSingleUploadBytes =
        currentCommand?.role === ROLE_ADMIN ? MAX_ADMIN_BATCH_BYTES : MAX_UPLOAD_BYTES;

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

        for (const file of files) {
            const parsed = parseBenchFileName(file.name);
            if (!parsed.ok) {
                setUploadError(parsed.error);
                return;
            }

            if (file.size > maxSingleUploadBytes) {
                setUploadError(
                    currentCommand?.role === ROLE_ADMIN
                        ? "File is too large. Maximum size is 50 GB for admin."
                        : "File is too large. Maximum size is 500 MB."
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

        const savedPoint = await savePoint({ ...point, authKey: authKeyDraft, fileSize: sourceFile.size });
        return savedPoint || point;
    }

    async function addPointFromFile(e) {
        e.preventDefault();
        if (benchFiles.length === 0) return;

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
                        reason:
                            currentCommand?.role === ROLE_ADMIN
                                ? "File is too large. Maximum size is 50 GB for admin."
                                : "File is too large. Maximum size is 500 MB.",
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
            for (const file of benchFiles) {
                const parsed = parseBenchFileName(file.name);
                if (!parsed.ok) return false;
                if (file.size > maxSingleUploadBytes) return false;
            }
            const description = normalizeDescriptionForSubmit();
            if (description.length > MAX_DESCRIPTION_LEN) return false;
            return true;
        })();

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
            <div className="loginPage">
                <div className="loginCard card">
                    <div className="cardHeader">
                        <div>
                            <div className="cardTitle">Access key required</div>
                            <div className="cardHint">
                                {isBootstrapping ? "Checking saved key..." : "Enter your team key to open the site."}
                            </div>
                        </div>
                    </div>

                    <form className="form" onSubmit={tryLogin}>
                        <label className="field">
                            <span>Key</span>
                            <input
                                value={authKeyDraft}
                                onChange={(e) => setAuthKeyDraft(e.target.value)}
                                placeholder="key_XXXXXXXXXXXXXXXX"
                                autoFocus
                                disabled={isBootstrapping || isAuthChecking}
                            />
                        </label>

                        {authError ? <div className="error">{authError}</div> : null}

                        <button className="btn primary" type="submit" disabled={isBootstrapping || isAuthChecking}>
                            {isAuthChecking ? "Checking..." : "Enter"}
                        </button>
                    </form>
                </div>
            </div>
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
                    <button className="btn ghost small" type="button" onClick={logout}>
                        Log out
                    </button>
                </div>
            </header>

            <main className="layout">
                <div className="leftCol">
                    <section className="card chartCard">
                        <div className="cardHeader">
                            <div>
                                <div className="cardTitle">Pareto curve</div>
                                <div className="cardHint">
                                    Pareto frontier is computed from points visible by benchmark + status filters.
                                    Changing the view rectangle does not change the frontier — it only crops what part of
                                    it is visible.
                                </div>
                                <div className="cardHint">
                                    Click any point on the chart to open actions: <b>Download</b> and <b>Delete</b>.
                                </div>
                            </div>

                            <div className="toolbar">
                                {isTestBenchSelected ? (
                                    <>
                                        <button className="btn ghost" onClick={generateRandomTestPoints}>
                                            Generate random points
                                        </button>
                                        <button className="btn danger" onClick={clearAllTestNoConfirm}>
                                            Clear all (test)
                                        </button>
                                    </>
                                ) : null}

                                <button className="btn ghost" onClick={downloadBenchmarksExcel}>
                                    Export benchmarks (Excel)
                                </button>
                            </div>
                        </div>

                        <div className="chartWrap" tabIndex={-1} onMouseDown={(e) => e.preventDefault()}>
                            <ResponsiveContainer width="100%" height="100%">
                                <ScatterChart margin={{ top: 10, right: 18, bottom: 10, left: 10 }}>
                                    <CartesianGrid strokeDasharray="2 2" />
                                    <ReferenceLine x={0} strokeOpacity={0.15} />
                                    <ReferenceLine y={0} strokeOpacity={0.15} />
                                    <ReferenceLine x={delayOverflowLane} strokeOpacity={0.1} />
                                    <ReferenceLine y={areaOverflowLane} strokeOpacity={0.1} />

                                    <XAxis
                                        type="number"
                                        dataKey="delayDisp"
                                        tickLine={false}
                                        axisLine={false}
                                        domain={[0, delayOverflowLane]}
                                        allowDecimals={false}
                                        ticks={delayAxis.ticks}
                                        tickFormatter={formatDelayTick}
                                    />
                                    <YAxis
                                        type="number"
                                        dataKey="areaDisp"
                                        tickLine={false}
                                        axisLine={false}
                                        domain={[0, areaOverflowLane]}
                                        allowDecimals={false}
                                        ticks={areaAxis.ticks}
                                        tickFormatter={formatAreaTick}
                                        width={areaAxisWidth}
                                    />

                                    <Tooltip content={<CustomTooltip />} />

                                    {/* Pareto curve (cropped to rectangle): strong double-stroke line */}
                                    <Scatter
                                        data={paretoDisplay.map((p) => ({ ...p, delayDisp: p.delay, areaDisp: p.area }))}
                                        line={{ stroke: "rgba(255,255,255,0.98)", strokeWidth: 4 }}
                                        isAnimationActive={false}
                                        shape={null}
                                        fill="none"
                                        style={{ pointerEvents: "none" }}
                                    />

                                    <Scatter
                                        data={paretoDisplay.map((p) => ({ ...p, delayDisp: p.delay, areaDisp: p.area }))}
                                        line={{ stroke: "rgba(17,24,39,0.98)", strokeWidth: 2 }}
                                        isAnimationActive={false}
                                        shape={(props) => {
                                            const { cx, cy } = props;
                                            return (
                                                <circle
                                                    cx={cx}
                                                    cy={cy}
                                                    r={3.2}
                                                    fill="rgba(17,24,39,0.98)"
                                                    stroke="#ffffff"
                                                    strokeWidth={1}
                                                    tabIndex={-1}
                                                    focusable="false"
                                                    style={{ pointerEvents: "none" }}
                                                />
                                            );
                                        }}
                                        fill="none"
                                        style={{ pointerEvents: "none" }}
                                    />

                                    {/* Main points: click to open point actions modal */}
                                    <Scatter
                                        key={pointsRenderKey}
                                        data={plottedPoints}
                                        isAnimationActive={false}
                                        shape={(props) => {
                                            const { cx, cy, payload } = props;

                                            const baseFill =
                                                colorMode === "users"
                                                    ? commandColor(payload.sender, commandByName)
                                                    : statusColor(payload.status);

                                            const isLatest = payload.id === lastAddedId;

                                            const r0 = payload.radius;
                                            const r = isLatest ? r0 * 1.5 : r0; // +50% size for latest diamond

                                            const fill = baseFill;

                                            const onClick = () => openPointActionModal(payload.id);

                                            if (isLatest) {
                                                return (
                                                    <Diamond
                                                        cx={cx}
                                                        cy={cy}
                                                        r={r}
                                                        fill={fill}
                                                        stroke="#ffffff"
                                                        strokeWidth={1}
                                                        onClick={onClick}
                                                    />
                                                );
                                            }

                                            return (
                                                <circle
                                                    cx={cx}
                                                    cy={cy}
                                                    r={r}
                                                    fill={fill}
                                                    stroke="#ffffff"
                                                    strokeWidth={1}
                                                    onClick={onClick}
                                                    tabIndex={-1}
                                                    focusable="false"
                                                    onMouseDown={(e) => e.preventDefault()}
                                                    style={{ cursor: "pointer" }}
                                                />
                                            );
                                        }}
                                    />
                                </ScatterChart>
                            </ResponsiveContainer>
                        </div>

                        {/* View rectangle */}
                        <form className="viewControls" onSubmit={applyView}>
                            <div className="viewTitle">View rectangle</div>

                            <label className="field compact">
                  <span>
                    delay max (≤ <TenPowNine />)
                  </span>
                                <input
                                    value={delayMaxDraft}
                                    onChange={(e) => setDelayMaxDraft(e.target.value)}
                                    placeholder="positive integer"
                                    inputMode="numeric"
                                    className={!delayViewValid ? "bad" : ""}
                                />
                            </label>

                            <label className="field compact">
                  <span>
                    area max (≤ <TenPowNine />)
                  </span>
                                <input
                                    value={areaMaxDraft}
                                    onChange={(e) => setAreaMaxDraft(e.target.value)}
                                    placeholder="positive integer"
                                    inputMode="numeric"
                                    className={!areaViewValid ? "bad" : ""}
                                />
                            </label>

                            <button className="btn primary" type="submit" disabled={!canApplyView}>
                                Apply
                            </button>
                        </form>
                    </section>

                    <section className="card listCard sentCard">
                        <div className="cardHeader tight">
                            <div>
                                <div className="cardTitle">Sended points</div>
                            </div>
                        </div>

                        <div className="list compactList">
                            {myPoints.length === 0 ? (
                                <div className="empty">No points from your command.</div>
                            ) : (
                                sentPageItems.map((p, i) => {
                                    const globalIndex = sentTotal - (sentStart + i);
                                    return (
                                        <div className="row compactRow" key={p.id}>
                                            <div className="compactMain">
                                                <div className="compactTop">
                                                    <span className="pill subtle">id: {p.id}</span>
                                                    <span className="pill">benchmark: {p.benchmark}</span>
                                                    <span className="pill">
                        <span className="dot" style={{ background: statusColor(p.status) }} />
                                                        {p.status}
                      </span>
                                                </div>

                                                <div className="compactBottom">
                      <span className="mono">
                        delay=<b>{formatIntNoGrouping(p.delay)}</b>
                      </span>
                                                    <span className="mono">
                        area=<b>{formatIntNoGrouping(p.area)}</b>
                      </span>
                                                </div>
                                            </div>

                                            <div className="sentActions">
                                                <div className="sentSubmission">submission: {globalIndex}</div>
                                                <button className="btn ghost small" onClick={() => focusPoint(p)}>
                                                    Find
                                                </button>
                                                <button
                                                    className="btn ghost small"
                                                    onClick={() => downloadCircuit(p)}
                                                    disabled={!getPointDownloadUrl(p)}
                                                >
                                                    Download circuit
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {myPoints.length > 0 ? (
                            <div className="sentPagerNumbers">
                                {sentPages.map((page) => {
                                    const isActive = page === sentPageClamped;
                                    return (
                                        <button
                                            key={page}
                                            className={isActive ? "pagerNum active" : "pagerNum"}
                                            type="button"
                                            onClick={() => setSentPage(page)}
                                        >
                                            {page}
                                        </button>
                                    );
                                })}
                            </div>
                        ) : null}
                    </section>
                </div>

                <aside className="side">
                    <section className="card">
                        <div className="cardHeader tight">
                            <div>
                                <div className="cardTitle">Filters</div>
                            </div>
                        </div>

                        <div className="form">
                            <label className="field">
                                <span>1) Benchmark</span>
                                <div className="benchmarkDropdown" ref={benchmarkMenuRef}>
                                    <button
                                        className="benchmarkTrigger"
                                        type="button"
                                        onClick={() => setBenchmarkMenuOpen((v) => !v)}
                                        aria-expanded={benchmarkMenuOpen ? "true" : "false"}
                                    >
                                        <span>{benchmarkLabel}</span>
                                        <span className="benchmarkCaret">{benchmarkMenuOpen ? "▲" : "▼"}</span>
                                    </button>

                                    {benchmarkMenuOpen ? (
                                        <div className="benchmarkMenu" role="listbox">
                                            <button
                                                className="benchmarkOption"
                                                type="button"
                                                onClick={() => {
                                                    setBenchmarkFilter("test");
                                                    setBenchmarkMenuOpen(false);
                                                }}
                                            >
                                                test
                                            </button>
                                            {availableBenchmarks.map((b) => (
                                                <button
                                                    key={b}
                                                    className="benchmarkOption"
                                                    type="button"
                                                    onClick={() => {
                                                        setBenchmarkFilter(String(b));
                                                        setBenchmarkMenuOpen(false);
                                                    }}
                                                >
                                                    {b}
                                                </button>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>
                            </label>

                            <label className="field">
                                <span>2) Color by</span>
                                <select value={colorMode} onChange={(e) => setColorMode(e.target.value)}>
                                    <option value="status">Status</option>
                                    <option value="users">Users</option>
                                </select>
                            </label>

                            <div className="field">
                                <span>3) Show statuses</span>

                                <div className={colorMode === "users" ? "statusUsersRow" : undefined}>
                                    {colorMode === "users" ? (
                                        <div className="userPicker">
                                            <div className="userPickerTitle">Commands</div>

                                            <input
                                                value={commandQuery}
                                                onChange={(e) => setCommandQuery(e.target.value)}
                                                placeholder="Search by prefix…"
                                            />

                                            <div className="userList">
                                                {availableCommandNames
                                                    .filter((name) => {
                                                        const q = commandQuery.trim().toLowerCase();
                                                        if (!q) return true;
                                                        return name.toLowerCase().startsWith(q);
                                                    })
                                                    .map((name) => {
                                                        const col = commandColor(name, commandByName);
                                                        return (
                                                            <button
                                                                key={name}
                                                                className="userItem"
                                                                type="button"
                                                                onClick={() => addSelectedCommand(name)}
                                                                disabled={selectedCommandSet.has(name)}
                                                                title={selectedCommandSet.has(name) ? "Already selected" : "Add"}
                                                            >
                                                                <span className="dot" style={{ background: col }} />
                                                                <span className="userItemName">{name}</span>
                                                            </button>
                                                        );
                                                    })}</div>

                                            <div className="viewingBar">
                                                <div className="viewingTitle">
                                                    Viewing{" "}
                                                    {selectedCommands.length > 0
                                                        ? `${selectedCommands.length} command${selectedCommands.length === 1 ? "" : "s"}`
                                                        : "all commands"}
                                                </div>

                                                <div className="chipsRow">
                                                    {selectedCommands.length === 0 ? (
                                                        <div className="mutedSmall">
                                                            No commands selected — showing all.
                                                        </div>
                                                    ) : (
                                                        selectedCommands.map((name) => {
                                                            const c = commandByName.get(name);
                                                            const col = c ? c.color : commandColor(name, commandByName);
                                                            return (
                                                                <span key={name} className="tagChip">
                                                                    <span className="dot" style={{ background: col }} />
                                                                    <span className="tagChipText">{name}</span>
                                                                    <button
                                                                        className="tagChipX"
                                                                        type="button"
                                                                        onClick={() => removeSelectedCommand(name)}
                                                                        aria-label={"Remove " + name}
                                                                        title="Remove"
                                                                    >
                                                                        ×
                                                                    </button>
                                                                </span>
                                                            );
                                                        })
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ) : null}

                                    <div className={colorMode === "users" ? "checks noDots" : "checks"}>
                                        <label className="check">
                                            <input
                                                type="checkbox"
                                                checked={statusFilter["non-verified"]}
                                                onChange={() => toggleStatus("non-verified")}
                                            />
                                            {colorMode !== "users" ? (
                                                <span className="dot" style={{ background: statusColor("non-verified") }} />
                                            ) : null}
                                            <span>non-verified</span>
                                        </label>

                                        <label className="check">
                                            <input
                                                type="checkbox"
                                                checked={statusFilter.verified}
                                                onChange={() => toggleStatus("verified")}
                                            />
                                            {colorMode !== "users" ? (
                                                <span className="dot" style={{ background: statusColor("verified") }} />
                                            ) : null}
                                            <span>verified</span>
                                        </label>

                                        <label className="check">
                                            <input
                                                type="checkbox"
                                                checked={statusFilter.failed}
                                                onChange={() => toggleStatus("failed")}
                                            />
                                            {colorMode !== "users" ? (
                                                <span className="dot" style={{ background: statusColor("failed") }} />
                                            ) : null}
                                            <span>failed</span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className="card">
                        <div className="cardHeader tight">
                            <div>
                                <div className="cardTitle">Add a point</div>

                                <div className="cardHint">
                                    <b>Expected file name pattern</b>:
                                </div>

                                <div className="cardHint">
                  <span className="mono">
                    bench{`{BENCH}`}_{`{DELAY}`}_{`{AREA}`} or bench{`{BENCH}`}_{`{DELAY}`}_{`{AREA}`}.bench
                  </span>
                                </div>

                                <div className="cardHint">
                                    Where:
                                    <ul className="hintList">
                                        <li>
                                            <span className="mono">{`{BENCH}`}</span> is an integer from <b>200</b> to{" "}
                                            <b>299</b>
                                        </li>
                                        <li>
                                            <span className="mono">{`{DELAY}`}</span> and{" "}
                                            <span className="mono">{`{AREA}`}</span> are integers (0..10^9)
                                        </li>
                                        <li>
                                            <span className="mono">description</span> is optional (up to{" "}
                                            <b>{MAX_DESCRIPTION_LEN}</b> chars), default is <b>schema</b>
                                        </li>
                                        <li>input file name length ≤ {MAX_INPUT_FILENAME_LEN}</li>
                                    </ul>
                                </div>

                                <div className="cardHint">
                                    Example input: <span className="mono">bench254_15_40</span>
                                </div>

                                <div className="cardHint">
                                    Stored file name is generated automatically:
                                    <span className="mono"> bench{`{BENCH}`}_{`{DELAY}`}_{`{AREA}`}_{`{COMMAND}`}_{`{POINT_ID}`}.bench</span>
                                </div>

                                <div className="cardHint">
                                    The latest added point is shown as a <b>diamond</b> on the chart.
                                </div>

                                <div className="cardHint">File is uploaded to S3. Limit: 500 MB per file (admin: 50 GB).</div>
                                {isAdmin ? (
                                    <div className="cardHint">
                                        Admin can select multiple files in this form. The same description is applied to every point.
                                    </div>
                                ) : null}
                            </div>
                        </div>

                        <form className="form" onSubmit={addPointFromFile}>
                            <label className="field">
                                <span>file</span>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".bench"
                                    multiple={isAdmin}
                                    onChange={onFileChange}
                                    className={benchFiles.length > 0 && !canAdd ? "bad" : ""}
                                />
                            </label>

                            <label className="field">
                                <span>description (max {MAX_DESCRIPTION_LEN})</span>
                                <input
                                    value={descriptionDraft}
                                    onChange={(e) => {
                                        setDescriptionDraft(e.target.value.slice(0, MAX_DESCRIPTION_LEN));
                                        setUploadError(" ");
                                    }}
                                    placeholder="Short description (default: schema)"
                                />
                            </label>

                            {uploadError.trim() ? <div className="error">{uploadError}</div> : null}

                            <button className="btn primary" type="submit" disabled={!canAdd}>
                                {isUploading ? "Uploading..." : "Upload & create point"}
                            </button>

                            {isUploading && uploadProgress && uploadProgress.total > 1 ? (
                                <div className="cardHint">
                                    Processed {uploadProgress.done} / {uploadProgress.total} files
                                </div>
                            ) : null}

                            {uploadLogText ? (
                                <button className="btn ghost" type="button" onClick={downloadUploadLog}>
                                    Download upload log
                                </button>
                            ) : null}
                        </form>
                    </section>

                    <section className="card listCard">
                        <div className="cardHeader tight">
                            <div>
                                <div className="cardTitle">Find points</div>
                                <div className="cardHint">
                                    Search by <b>file name prefix</b>. Shows exactly {DELETE_PREVIEW_LIMIT} slots.
                                </div>
                            </div>
                        </div>

                        <div className="form">
                            <label className="field">
                                <span>file prefix</span>
                                <input
                                    value={deletePrefix}
                                    onChange={(e) => setDeletePrefix(e.target.value)}
                                    placeholder="e.g. bench256_123"
                                />
                            </label>
                        </div>

                        <div className="list compactList deleteListFixed">
                            {deletePreview.map((p) => (
                                <div className="row compactRow" key={p.id}>
                                    <div className="compactMain">
                                        <div className="compactTop">
                                            <span className="pill subtle">by {p.sender}</span>
                                            <span className="pill">name: {p.description}</span>
                                            <span className="pill">
                        <span className="dot" style={{ background: statusColor(p.status) }} />
                                                {p.status}
                      </span>
                                        </div>

                                        <div className="compactBottom">
                      <span className="mono">
                        area=<b>{formatIntNoGrouping(p.area)}</b>
                      </span>
                                            <span className="mono">
                        delay=<b>{formatIntNoGrouping(p.delay)}</b>
                      </span>
                                            <span className="mono mutedMono">{p.fileName}</span>
                                        </div>
                                    </div>

                                    <button className="btn ghost small" onClick={() => focusPoint(p)}>
                                        Find
                                    </button>
                                    <button
                                        className="btn ghost small"
                                        onClick={() => downloadCircuit(p)}
                                        disabled={!getPointDownloadUrl(p)}
                                    >
                                        Download circuit
                                    </button>
                                    {canDeletePoint(p) ? (
                                        <button
                                            className="btn danger small"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                confirmAndDeletePoint(p.id);
                                            }}
                                        >
                                            Delete
                                        </button>
                                    ) : null}
                                </div>
                            ))}

                            {Array.from({ length: placeholdersCount }).map((_, i) => (
                                <div className="row compactRow placeholderRow" key={`ph-${i}`}>
                                    <div className="placeholderLine" />
                                </div>
                            ))}
                        </div>

                        {deleteMatches.length === 0 ? (
                            <div className="empty">No points match this prefix.</div>
                        ) : deleteHasMore ? (
                            <div className="moreHint">
                                Showing {deletePreview.length} of {deleteMatches.length} matches.
                            </div>
                        ) : null}
                    </section>

                </aside>
            </main>

            {actionPoint ? (
                <div className="pointModalBackdrop" onClick={closePointActionModal}>
                    <div className="pointModal" onClick={(e) => e.stopPropagation()}>
                        <div className="pointModalTitle">Point actions</div>
                        <div className="pointModalFile mono">{actionPoint.fileName}</div>
                        <div className="pointModalActions">
                            <button
                                className="btn ghost small"
                                onClick={() => downloadCircuit(actionPoint)}
                                disabled={!getPointDownloadUrl(actionPoint)}
                            >
                                Download
                            </button>
                            {canDeletePoint(actionPoint) ? (
                                <button
                                    className="btn danger small"
                                    onClick={async () => {
                                        const deleted = await confirmAndDeletePoint(actionPoint.id);
                                        if (deleted) closePointActionModal();
                                    }}
                                >
                                    Delete
                                </button>
                            ) : null}
                            <button className="btn small" onClick={closePointActionModal}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {navigateNotice ? (
                <div className="navigateToast" role="status" aria-live="polite">
                    {navigateNotice}
                </div>
            ) : null}

            <footer className="footer" />
        </div>
    );
}

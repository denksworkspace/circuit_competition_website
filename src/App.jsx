import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
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

const MAX_VALUE = 1_000_000_000; // 10^9
const DIVISIONS = 10;
const MAX_FILENAME_LEN = 80;

// bench[200-299]_[delay]_[area]_[description]_[sender].bench
const BENCH_NAME_RE =
    /^bench(2\d\d)_(\d+)_(\d+)_([A-Za-z0-9-]+)_([A-Za-z0-9-]+)\.bench$/;

const DELETE_PREVIEW_LIMIT = 3;

const STATUS_LIST = ["non-verified", "verified", "failed"];
const COMMAND_COUNT = 15;

// Brighter, more separated palette
const USER_PALETTE = [
    "#ff1744",
    "#ff9100",
    "#ffea00",
    "#00e676",
    "#00e5ff",
    "#2979ff",
    "#651fff",
    "#d500f9",
    "#1de9b6",
    "#f50057",
];

// Static teams (commands) with GitHub-token-like keys.
// Key format: key_<16 alphanumeric chars>
const COMMANDS = [
    { name: "command1", color: "#ff1744", key: "key_iK2ZWeqhFWCEPyYn" },
    { name: "command2", color: "#ff9100", key: "key_9382dffx1kVZQ2tq" },
    { name: "command3", color: "#ffea00", key: "key_pLIix6MEOLeMa61E" },
    { name: "command4", color: "#00e676", key: "key_ptgUzEjfebzJ6sZW" },
    { name: "command5", color: "#00e5ff", key: "key_NqVwYS81VP7Hb1DX" },
    { name: "command6", color: "#2979ff", key: "key_YK0fFWqcajQLE9WV" },
    { name: "command7", color: "#651fff", key: "key_u8jzPde0IgxLd6Gn" },
    { name: "command8", color: "#d500f9", key: "key_ox9yimTcfipZGnzP" },
    { name: "command9", color: "#1de9b6", key: "key_DNxril3RavGD5Mfv" },
    { name: "command10", color: "#f50057", key: "key_KcBEKanD0F0rPZkc" },
    { name: "command11", color: "#22c55e", key: "key_C3J27XDCG2LmlZGE" },
    { name: "command12", color: "#e11d48", key: "key_ErQHQwjyaxErPZDS" },
    { name: "command13", color: "#0ea5e9", key: "key_qsR6RZ24lPoQj3oP" },
    { name: "command14", color: "#a855f7", key: "key_gNSWPH8prVqsUeQC" },
    { name: "command15", color: "#14b8a6", key: "key_9naHVck6pbd4ZRj2" },
];

const COMMAND_BY_KEY = new Map(COMMANDS.map((c) => [c.key, c]));
const COMMAND_BY_NAME = new Map(COMMANDS.map((c) => [c.name, c]));


function uid() {
    return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function clamp(value, lo, hi) {
    return Math.min(hi, Math.max(lo, value));
}

function formatIntNoGrouping(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "";
    return Math.trunc(n).toLocaleString("en-US", { useGrouping: false });
}

function buildAxis(maxValue, divisions, hardCap) {
    const max = clamp(Math.floor(maxValue), 1, hardCap);
    const div = Math.max(1, Math.floor(divisions));
    const step = Math.max(1, Math.ceil(max / div));

    let overflow = max + step;
    overflow = Math.min(overflow, hardCap);

    const ticks = [0];
    for (let v = step; v < max; v += step) ticks.push(v);
    if (ticks[ticks.length - 1] !== max) ticks.push(max);
    if (ticks[ticks.length - 1] !== overflow) ticks.push(overflow);

    return { max, step, overflow, ticks };
}

function TenPowNine() {
    return (
        <span>
      10<sup>9</sup>
    </span>
    );
}

function parsePosIntCapped(str, maxValue) {
    if (str === "") return null;
    if (!/^\d+$/.test(str)) return null;
    const n = Number(str);
    if (!Number.isSafeInteger(n) || n < 1 || n > maxValue) return null;
    return n;
}

function statusColor(status) {
    if (status === "verified") return "#16a34a"; // green
    if (status === "failed") return "#dc2626"; // red
    return "#2563eb"; // non-verified -> blue
}

function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function userColor(sender) {
    const idx = hashString(sender || "unknown") % USER_PALETTE.length;
    return USER_PALETTE[idx];
}


function commandColor(sender) {
    // If this is a test sender like "test_command7", map it to "command7" colors.
    const s = String(sender || "");
    const testMatch = s.match(/^test_command(\d+)$/);
    if (testMatch) {
        const mapped = `command${testMatch[1]}`;
        const mappedCmd = COMMAND_BY_NAME.get(mapped);
        if (mappedCmd) return mappedCmd.color;
        return userColor(mapped);
    }

    const cmd = COMMAND_BY_NAME.get(s);
    if (cmd) return cmd.color;
    return userColor(s);
}


function parseBenchFileName(fileNameRaw) {
    const fileName = (fileNameRaw || "").trim();
    if (!fileName) return { ok: false, error: "Empty file name." };
    if (fileName.length > MAX_FILENAME_LEN) {
        return {
            ok: false,
            error: `File name is too long (max ${MAX_FILENAME_LEN}).`,
        };
    }

    const m = fileName.match(BENCH_NAME_RE);
    if (!m) {
        return {
            ok: false,
            error:
                "Invalid file name pattern. Expected: bench{200..299}_<delay>_<area>_<description>_<sender>.bench",
        };
    }

    const benchmark = Number(m[1]);
    const delay = Number(m[2]);
    const area = Number(m[3]);
    const description = m[4];
    const sender = m[5];

    if (!Number.isSafeInteger(benchmark) || benchmark < 200 || benchmark > 299) {
        return { ok: false, error: "Benchmark must be in [200..299]." };
    }
    if (!Number.isSafeInteger(delay) || delay < 0 || delay > MAX_VALUE) {
        return { ok: false, error: "Delay must be an integer in [0..10^9]." };
    }
    if (!Number.isSafeInteger(area) || area < 0 || area > MAX_VALUE) {
        return { ok: false, error: "Area must be an integer in [0..10^9]." };
    }

    return {
        ok: true,
        benchmark,
        delay,
        area,
        description,
        sender,
        fileName,
    };
}

function CustomTooltip({ active, payload }) {
    if (!active || !payload || payload.length === 0) return null;
    const p = payload[0]?.payload;
    if (!p) return null;

    return (
        <div className="tooltip">
            <div className="tooltipTitle">Point</div>

            <div className="tooltipRow">
                <span className="tooltipKey">benchmark:</span>
                <span className="tooltipVal">{p.benchmark}</span>
            </div>

            <div className="tooltipRow">
                <span className="tooltipKey">sender:</span>
                <span className="tooltipVal">{p.sender}</span>
            </div>

            <div className="tooltipRow">
                <span className="tooltipKey">status:</span>
                <span className="tooltipVal">{p.status}</span>
            </div>

            <div className="tooltipRow">
                <span className="tooltipKey">name:</span>
                <span className="tooltipVal">{p.description}</span>
            </div>

            <div className="tooltipRow">
                <span className="tooltipKey">delay:</span>
                <span className="tooltipVal">{formatIntNoGrouping(p.delay)}</span>
            </div>

            <div className="tooltipRow">
                <span className="tooltipKey">area:</span>
                <span className="tooltipVal">{formatIntNoGrouping(p.area)}</span>
            </div>

            {p.fileName ? (
                <div className="tooltipRow">
                    <span className="tooltipKey">file:</span>
                    <span className="tooltipVal">{p.fileName}</span>
                </div>
            ) : null}
        </div>
    );
}

function randInt(lo, hiInclusive) {
    return lo + Math.floor(Math.random() * (hiInclusive - lo + 1));
}

function randomChoice(arr) {
    return arr[randInt(0, arr.length - 1)];
}

// Diamond for latest point
function Diamond({ cx, cy, r, fill, stroke, strokeWidth, onClick }) {
    const d = r * 1.35;
    const points = `${cx},${cy - d} ${cx + d},${cy} ${cx},${cy + d} ${cx - d},${cy}`;
    return (
        <polygon
            points={points}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            onClick={onClick}
            tabIndex={-1}
            focusable="false"
            onMouseDown={(e) => e.preventDefault()}
            style={{ cursor: "pointer" }}
        />
    );
}

function computeParetoFrontOriginal(points) {
    const sorted = [...points].sort((a, b) => {
        if (a.delay !== b.delay) return a.delay - b.delay;
        return a.area - b.area;
    });

    const front = [];
    let bestArea = Infinity;

    for (const p of sorted) {
        if (p.area < bestArea) {
            front.push(p);
            bestArea = p.area;
        }
    }
    return front;
}

function pickInt(lo, hi) {
    const a = Math.ceil(Math.min(lo, hi));
    const b = Math.floor(Math.max(lo, hi));
    if (a > b) return a;
    return a + Math.floor(Math.random() * (b - a + 1));
}

function pickAbove(minExclusive, maxInclusive) {
    const lo = Math.min(maxInclusive, minExclusive + 1);
    const hi = maxInclusive;
    if (lo > hi) return hi;
    return pickInt(lo, hi);
}

/**
 * Choose area for a delay that DOES NOT exist yet.
 * We look at current Pareto-front points and find the nearest front point on the left and right by delay.
 *
 * If left has area1 and right has area2:
 * 50% -> uniform in [min(area1, area2), max(area1, area2)]
 * 50% -> uniform in (max(area1, area2), 1000]
 *
 * If only one side exists with areaS:
 * 50% -> uniform in [100, areaS]
 * 50% -> uniform in (areaS, 1000]
 *
 * If no front points exist yet: uniform [100..1000]
 */
function chooseAreaSmartFromParetoFront(frontPoints, newDelay) {
    const sortedFront = [...frontPoints].sort((a, b) => a.delay - b.delay);

    let left = null;
    for (let i = sortedFront.length - 1; i >= 0; i--) {
        if (sortedFront[i].delay < newDelay) {
            left = sortedFront[i];
            break;
        }
    }

    let right = null;
    for (let i = 0; i < sortedFront.length; i++) {
        if (sortedFront[i].delay > newDelay) {
            right = sortedFront[i];
            break;
        }
    }

    if (!left && !right) return pickInt(100, 1000);

    if (left && right) {
        const lo = Math.min(left.area, right.area);
        const hi = Math.max(left.area, right.area);

        if (Math.random() < 0.5) return pickInt(lo, hi);
        return pickAbove(hi, 1000);
    }

    const areaS = (left ? left.area : right.area);
    const capped = clamp(areaS, 100, 1000);

    if (Math.random() < 0.5) return pickInt(100, capped);
    return pickAbove(capped, 1000);
}

export default function App() {
    const [points, setPoints] = useState(() => []);
    const [lastAddedId, setLastAddedId] = useState(null);

    // Simple access gate: user enters a command key before using the site.
    // We keep the key in localStorage so the user does not need to re-enter it each time.
    const [authKeyDraft, setAuthKeyDraft] = useState(() => localStorage.getItem("bench_auth_key") || "");
    const [currentCommand, setCurrentCommand] = useState(() => {
        const saved = localStorage.getItem("bench_auth_key") || "";
        return COMMAND_BY_KEY.get(saved) || null;
    });
    const [authError, setAuthError] = useState("");

    function tryLogin(e) {
        e.preventDefault();
        const k = authKeyDraft.trim();
        const cmd = COMMAND_BY_KEY.get(k) || null;
        if (!cmd) {
            setAuthError("Invalid key.");
            return;
        }
        localStorage.setItem("bench_auth_key", k);
        setCurrentCommand(cmd);
        setAuthError("");
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

    function addSelectedCommand(name) {
        setSelectedCommands((prev) => (prev.includes(name) ? prev : [...prev, name]));
    }

    function removeSelectedCommand(name) {
        setSelectedCommands((prev) => prev.filter((x) => x !== name));
    }

    // Upload (we DO NOT store the file itself)
    const [benchFile, setBenchFile] = useState(null);
    const [uploadError, setUploadError] = useState(" ");
    const fileInputRef = useRef(null);

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
    // point sizes
    const BASE_R = 4;
    const MIN_R = 2.8;
    const DIST_SCALE = 0.02;

    function computeRadius(p) {
        // no clipping shrinking here; we keep your existing logic
        // (it only shrinks when clipped, but still ok)
        const outsideDelay = Math.max(0, p.delay - delayMax);
        const outsideArea = Math.max(0, p.area - areaMax);
        const isClipped = outsideDelay > 0 || outsideArea > 0;

        if (!isClipped) return BASE_R;
        const dist = Math.hypot(outsideDelay, outsideArea);
        const rr = BASE_R / (1 + dist * DIST_SCALE);
        return clamp(rr, MIN_R, BASE_R);
    }

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
    const plottedPoints = useMemo(() => {
        return visiblePoints.map((p) => {
            const displayDelay = p.delay > delayMax ? delayOverflowLane : p.delay;
            const displayArea = p.area > areaMax ? areaOverflowLane : p.area;

            return {
                ...p,
                delayDisp: displayDelay,
                areaDisp: displayArea,
            };
        });
    }, [visiblePoints, delayMax, areaMax, delayOverflowLane, areaOverflowLane]);

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

    async function fetchPoints() {
        const res = await fetch("/api/points");
        if (!res.ok) {
            const data = await res.json().catch(() => null);
            const msg = data?.error || "Failed to load points.";
            throw new Error(msg);
        }
        const data = await res.json();
        return Array.isArray(data.points) ? data.points : [];
    }

    useEffect(() => {
        let alive = true;
        fetchPoints()
            .then((rows) => {
                if (!alive) return;
                setPoints(rows);
            })
            .catch((e) => {
                if (!alive) return;
                console.error(e);
            });
        return () => {
            alive = false;
        };
    }, []);

    function clearFileInput() {
        setBenchFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    }

    function onFileChange(e) {
        const file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
        setBenchFile(file);

        if (!file) {
            setUploadError(" ");
            return;
        }

        const parsed = parseBenchFileName(file.name);
        if (!parsed.ok) {
            setUploadError(parsed.error);
            return;
        }

        if (points.some((p) => p.fileName === parsed.fileName)) {
            setUploadError("A point with this file name already exists.");
            return;
        }

        setUploadError(" ");
    }

    async function addPointFromFile(e) {
        e.preventDefault();
        if (!benchFile) return;

        const parsed = parseBenchFileName(benchFile.name);
        if (!parsed.ok) {
            setUploadError(parsed.error);
            return;
        }

        if (points.some((p) => p.fileName === parsed.fileName)) {
            setUploadError("A point with this file name already exists.");
            clearFileInput();
            return;
        }

        if (parsed.sender !== currentCommand.name) {
            setUploadError("Sender in file name must match your command.");
            return;
        }

        const point = {
            id: uid(),
            benchmark: parsed.benchmark,
            delay: parsed.delay,
            area: parsed.area,
            description: parsed.description,
            sender: parsed.sender,
            fileName: parsed.fileName,
            status: "non-verified",
            checkerVersion: null,
        };

        const res = await fetch("/api/points", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...point, authKey: authKeyDraft }),
        });

        if (!res.ok) {
            const data = await res.json().catch(() => null);
            setUploadError(data?.error || "Failed to save point.");
            return;
        }

        const data = await res.json();
        const saved = data?.point || point;

        setPoints((prev) => [saved, ...prev]);
        setLastAddedId(saved.id);
        setBenchmarkFilter(String(saved.benchmark));
        setUploadError(" ");
        clearFileInput();
    }

    async function deletePointById(id) {
        const p = points.find((x) => x.id === id);
        const label = p ? `${p.fileName}` : "this point";
        if (!window.confirm(`Delete ${label}?`)) return;

        if (p?.benchmark === "test") {
            setPoints((prev) => prev.filter((x) => x.id !== id));
            if (lastAddedId === id) setLastAddedId(null);
            return;
        }

        const res = await fetch("/api/points", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, authKey: authKeyDraft }),
        });

        if (!res.ok) {
            const data = await res.json().catch(() => null);
            window.alert(data?.error || "Failed to delete point.");
            return;
        }

        setPoints((prev) => prev.filter((x) => x.id !== id));
        if (lastAddedId === id) setLastAddedId(null);
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

            const cmdNum = randInt(1, COMMAND_COUNT);
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
        benchFile !== null &&
        (() => {
            const parsed = parseBenchFileName(benchFile.name);
            if (!parsed.ok) return false;
            if (points.some((p) => p.fileName === parsed.fileName)) return false;
            return true;
        })();

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

    function focusPoint(p) {
        if (!p) return;
        setBenchmarkFilter(String(p.benchmark));
        setLastAddedId(p.id);
    }

    if (!currentCommand) {
        return (
            <div className="loginPage">
                <div className="loginCard card">
                    <div className="cardHeader">
                        <div>
                            <div className="cardTitle">Access key required</div>
                            <div className="cardHint">Enter your team key to open the site.</div>
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
                            />
                        </label>

                        {authError ? <div className="error">{authError}</div> : null}

                        <button className="btn primary" type="submit">
                            Enter
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    const isTestBenchSelected = benchmarkFilter === "test";

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
                    <span className="dot" style={{ background: currentCommand.color }} />
                    <button className="btn ghost small" type="button" onClick={logout}>
                        Log out
                    </button>
                </div>
            </header>

            <main className="layout">
                <section className="card chartCard">
                    <div className="cardHeader">
                        <div>
                            <div className="cardTitle">Pareto curve</div>
                            <div className="cardHint">
                                Pareto frontier is computed from points visible by benchmark + status filters.
                                Changing the view rectangle does not change the frontier — it only crops what part of
                                it is visible.
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

                                {/* Main points: clickable delete */}
                                <Scatter
                                    data={plottedPoints}
                                    isAnimationActive={false}
                                    shape={(props) => {
                                        const { cx, cy, payload } = props;

                                        const baseFill =
                                            colorMode === "users" ? commandColor(payload.sender) : statusColor(payload.status);

                                        const isLatest = payload.id === lastAddedId;

                                        const r0 = computeRadius(payload);
                                        const r = isLatest ? r0 * 1.5 : r0; // +50% size for latest diamond

                                        const fill =
                                            payload.delay > delayMax || payload.area > areaMax
                                                ? "rgba(17,24,39,0.55)"
                                                : baseFill;

                                        const onClick = () => deletePointById(payload.id);

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
                                <select value={benchmarkFilter} onChange={(e) => setBenchmarkFilter(e.target.value)}>
                                    <option value="test">test</option>
                                    {availableBenchmarks.map((b) => (
                                        <option key={b} value={String(b)}>
                                            {b}
                                        </option>
                                    ))}
                                </select>
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
                                                        const col = commandColor(name);
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
                                                            const c = COMMAND_BY_NAME.get(name);
                                                            const col = c ? c.color : commandColor(name);
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
                    bench{`{BENCH}`}_{`{DELAY}`}_{`{AREA}`}_{`{DESCRIPTION}`}_{`{SENDER}`}.bench
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
                                            <span className="mono">{`{DESCRIPTION}`}</span> and{" "}
                                            <span className="mono">{`{SENDER}`}</span> contain only letters/digits/hyphen
                                            (<span className="mono">A-Z a-z 0-9 -</span>)
                                        </li>
                                        <li>total file name length ≤ {MAX_FILENAME_LEN}</li>
                                    </ul>
                                </div>

                                <div className="cardHint">
                                    Example: <span className="mono">bench256_123_10000_test_command1.bench</span>
                                </div>

                                <div className="cardHint">
                                    The latest added point is shown as a <b>diamond</b> on the chart.
                                </div>

                                <div className="cardHint">
                                    The file is not saved anywhere — only the file name is parsed.
                                </div>
                            </div>
                        </div>

                        <form className="form" onSubmit={addPointFromFile}>
                            <label className="field">
                                <span>file (.bench)</span>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".bench"
                                    onChange={onFileChange}
                                    className={benchFile && !canAdd ? "bad" : ""}
                                />
                            </label>

                            {uploadError.trim() ? <div className="error">{uploadError}</div> : null}

                            <button className="btn primary" type="submit" disabled={!canAdd}>
                                Upload & create point
                            </button>
                        </form>
                    </section>

                    <section className="card listCard">
                        <div className="cardHeader tight">
                            <div>
                                <div className="cardTitle">Delete points</div>
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
                                <div className="row compactRow" key={p.id} onClick={() => focusPoint(p)}>
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

                                    <button
                                        className="btn danger small"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            deletePointById(p.id);
                                        }}
                                    >
                                        Delete
                                    </button>
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

                    <section className="card listCard">
                        <div className="cardHeader tight">
                            <div>
                                <div className="cardTitle">Sended points</div>
                            </div>
                        </div>

                        <div className="list compactList">
                            {myPoints.length === 0 ? (
                                <div className="empty">No points from your command.</div>
                            ) : (
                                myPoints.map((p) => (
                                    <div className="row compactRow" key={p.id} onClick={() => focusPoint(p)}>
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
                                    </div>
                                ))
                            )}
                        </div>
                    </section>
                </aside>
            </main>

            <footer className="footer" />
        </div>
    );
}

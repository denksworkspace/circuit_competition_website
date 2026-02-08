import { useMemo, useRef, useState } from "react";
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

function uid() {
    return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function parseNonNegIntCapped(str, maxValue) {
    if (str === "") return null;
    if (!/^\d+$/.test(str)) return null;
    const n = Number(str);
    if (!Number.isSafeInteger(n) || n < 0 || n > maxValue) return null;
    return n;
}

function parsePosIntCapped(str, maxValue) {
    if (str === "") return null;
    if (!/^\d+$/.test(str)) return null;
    const n = Number(str);
    if (!Number.isSafeInteger(n) || n < 1 || n > maxValue) return null;
    return n;
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

function isBenchFile(file) {
    if (!file) return false;
    const name = (file.name || "").toLowerCase().trim();
    return name.endsWith(".bench");
}

function CustomTooltip({ active, payload }) {
    if (!active || !payload || payload.length === 0) return null;
    const p = payload[0]?.payload;
    if (!p) return null;

    return (
        <div className="tooltip">
            <div className="tooltipTitle">Point</div>

            <div className="tooltipRow">
                <span className="tooltipKey">original:</span>
                <span className="tooltipVal">
          (delay={p.originalDelayStr}, area={p.originalAreaStr})
        </span>
            </div>

            <div className="tooltipRow">
                <span className="tooltipKey">shown:</span>
                <span className="tooltipVal">
          (delay={p.displayDelayLabel}, area={p.displayAreaLabel})
        </span>
            </div>

            {p.fileName ? (
                <div className="tooltipRow">
                    <span className="tooltipKey">file:</span>
                    <span className="tooltipVal">{p.fileName}</span>
                </div>
            ) : null}

            {p.isClipped && (
                <div className="tooltipRow">
                    <span className="tooltipKey">outside:</span>
                    <span className="tooltipVal">
            dDelay={p.outsideDelayStr}, dArea={p.outsideAreaStr}
          </span>
                </div>
            )}
        </div>
    );
}

export default function App() {
    const [points, setPoints] = useState(() => [
        { id: uid(), delay: 2, area: 4, fileName: "example.bench" },
        { id: uid(), delay: 5, area: 7, fileName: "example.bench" },
        { id: uid(), delay: 8, area: 3, fileName: "example.bench" },
        { id: uid(), delay: 3, area: 9, fileName: "example.bench" },
        { id: uid(), delay: 100, area: 100000, fileName: "example.bench" },
    ]);

    // Add point inputs (0..10^9)
    const [delayInput, setDelayInput] = useState("");
    const [areaInput, setAreaInput] = useState("");

    // Required .bench file for adding a point
    const [benchFile, setBenchFile] = useState(null);
    const fileInputRef = useRef(null);

    // View rectangle inputs (1..10^9)
    const [delayMax, setDelayMax] = useState(10);
    const [areaMax, setAreaMax] = useState(10);
    const [delayMaxDraft, setDelayMaxDraft] = useState("10");
    const [areaMaxDraft, setAreaMaxDraft] = useState("10");

    const delayAxis = useMemo(() => buildAxis(delayMax, DIVISIONS, MAX_VALUE), [delayMax]);
    const areaAxis = useMemo(() => buildAxis(areaMax, DIVISIONS, MAX_VALUE), [areaMax]);

    const delayOverflowLane = delayAxis.overflow;
    const areaOverflowLane = areaAxis.overflow;

    // Point sizes
    const BASE_R = 4;
    const MIN_R = 2.8;
    const DIST_SCALE = 0.02;

    function computeRadius(p) {
        if (!p.isClipped) return BASE_R;
        const dist = Math.hypot(p.outsideDelay, p.outsideArea);
        const r = BASE_R / (1 + dist * DIST_SCALE);
        return clamp(r, MIN_R, BASE_R);
    }

    const plottedPoints = useMemo(() => {
        return points.map((p) => {
            const outsideDelay = Math.max(0, p.delay - delayMax);
            const outsideArea = Math.max(0, p.area - areaMax);
            const isClipped = outsideDelay > 0 || outsideArea > 0;

            const displayDelay = p.delay > delayMax ? delayOverflowLane : p.delay;
            const displayArea = p.area > areaMax ? areaOverflowLane : p.area;

            const displayDelayLabel =
                p.delay > delayMax ? `>${formatIntNoGrouping(delayMax)}` : formatIntNoGrouping(p.delay);
            const displayAreaLabel =
                p.area > areaMax ? `>${formatIntNoGrouping(areaMax)}` : formatIntNoGrouping(p.area);

            return {
                id: p.id,

                // keys used by Recharts
                delay: displayDelay,
                area: displayArea,

                // tooltip helpers
                originalDelayStr: formatIntNoGrouping(p.delay),
                originalAreaStr: formatIntNoGrouping(p.area),
                displayDelayLabel,
                displayAreaLabel,

                outsideDelay,
                outsideArea,
                outsideDelayStr: formatIntNoGrouping(outsideDelay),
                outsideAreaStr: formatIntNoGrouping(outsideArea),

                isClipped,
                fileName: p.fileName || "",
            };
        });
    }, [points, delayMax, areaMax, delayOverflowLane, areaOverflowLane]);

    // Prevent Y-axis label cropping for large numbers
    const areaAxisWidth = useMemo(() => {
        const labelA = `>${formatIntNoGrouping(areaMax)}`;
        const labelB = formatIntNoGrouping(areaOverflowLane);
        const longest = Math.max(labelA.length, labelB.length);
        return clamp(longest * 8 + 18, 52, 160);
    }, [areaMax, areaOverflowLane]);

    function onFileChange(e) {
        const file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
        setBenchFile(file);
    }

    function clearFile() {
        setBenchFile(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    }

    function addPoint(e) {
        e.preventDefault();

        const delay = parseNonNegIntCapped(delayInput, MAX_VALUE);
        const area = parseNonNegIntCapped(areaInput, MAX_VALUE);
        const okFile = isBenchFile(benchFile);

        if (delay === null || area === null || !okFile) return;

        setPoints((prev) => [
            { id: uid(), delay, area, fileName: benchFile.name },
            ...prev,
        ]);

        setDelayInput("");
        setAreaInput("");
        clearFile();
    }

    function deletePoint(id) {
        setPoints((prev) => prev.filter((p) => p.id !== id));
    }

    function clearAll() {
        setPoints([]);
    }

    function applyView(e) {
        e.preventDefault();
        const dMax = parsePosIntCapped(delayMaxDraft, MAX_VALUE);
        const aMax = parsePosIntCapped(areaMaxDraft, MAX_VALUE);
        if (dMax === null || aMax === null) return;

        setDelayMax(dMax);
        setAreaMax(aMax);
    }

    function resetView() {
        setDelayMax(10);
        setAreaMax(10);
        setDelayMaxDraft("10");
        setAreaMaxDraft("10");
    }

    const delayValid = delayInput === "" || parseNonNegIntCapped(delayInput, MAX_VALUE) !== null;
    const areaValid = areaInput === "" || parseNonNegIntCapped(areaInput, MAX_VALUE) !== null;

    const delayParsed = parseNonNegIntCapped(delayInput, MAX_VALUE);
    const areaParsed = parseNonNegIntCapped(areaInput, MAX_VALUE);

    const fileIsValid = benchFile === null ? false : isBenchFile(benchFile);

    const canAdd = delayParsed !== null && areaParsed !== null && fileIsValid;

    const delayViewValid =
        delayMaxDraft === "" || parsePosIntCapped(delayMaxDraft, MAX_VALUE) !== null;
    const areaViewValid =
        areaMaxDraft === "" || parsePosIntCapped(areaMaxDraft, MAX_VALUE) !== null;

    const canApplyView =
        parsePosIntCapped(delayMaxDraft, MAX_VALUE) !== null &&
        parsePosIntCapped(areaMaxDraft, MAX_VALUE) !== null;

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

    return (
        <div className="page">
            <header className="topbar">
                <div className="brand">
                    <div className="title">Points</div>
                </div>
            </header>

            <main className="layout">
                <section className="card chartCard">
                    <div className="cardHeader">
                        <div>
                            <div className="cardTitle">Scatter chart</div>
                        </div>

                        <div className="toolbar">
                            <button className="btn ghost" onClick={resetView}>
                                Reset view
                            </button>
                            <button className="btn ghost" onClick={clearAll} disabled={points.length === 0}>
                                Clear all
                            </button>
                        </div>
                    </div>

                    <div className="chartWrap">
                        <ResponsiveContainer width="100%" height="100%">
                            <ScatterChart margin={{ top: 10, right: 18, bottom: 10, left: 10 }}>
                                <CartesianGrid strokeDasharray="2 2" />
                                <ReferenceLine x={0} strokeOpacity={0.15} />
                                <ReferenceLine y={0} strokeOpacity={0.15} />
                                <ReferenceLine x={delayOverflowLane} strokeOpacity={0.10} />
                                <ReferenceLine y={areaOverflowLane} strokeOpacity={0.10} />

                                <XAxis
                                    type="number"
                                    dataKey="delay"
                                    tickLine={false}
                                    axisLine={false}
                                    domain={[0, delayOverflowLane]}
                                    allowDecimals={false}
                                    ticks={delayAxis.ticks}
                                    tickFormatter={formatDelayTick}
                                />

                                <YAxis
                                    type="number"
                                    dataKey="area"
                                    tickLine={false}
                                    axisLine={false}
                                    domain={[0, areaOverflowLane]}
                                    allowDecimals={false}
                                    ticks={areaAxis.ticks}
                                    tickFormatter={formatAreaTick}
                                    width={areaAxisWidth}
                                />

                                <Tooltip content={<CustomTooltip />} />

                                <Scatter
                                    data={plottedPoints}
                                    isAnimationActive={false}
                                    shape={(props) => {
                                        const { cx, cy, payload } = props;
                                        const r = computeRadius(payload);
                                        const fill = payload.isClipped ? "rgba(17,24,39,0.55)" : "#111827";
                                        return (
                                            <circle
                                                cx={cx}
                                                cy={cy}
                                                r={r}
                                                fill={fill}
                                                stroke="#ffffff"
                                                strokeWidth={1}
                                            />
                                        );
                                    }}
                                />
                            </ScatterChart>
                        </ResponsiveContainer>
                    </div>

                    <form className="viewControls" onSubmit={applyView}>
                        <div className="viewTitle">View rectangle</div>

                        <label className="field compact">
                            <span>delay max (≤ <TenPowNine />)</span>
                            <input
                                value={delayMaxDraft}
                                onChange={(e) => setDelayMaxDraft(e.target.value)}
                                placeholder="positive integer"
                                inputMode="numeric"
                                className={!delayViewValid ? "bad" : ""}
                            />
                        </label>

                        <label className="field compact">
                            <span>area max (≤ <TenPowNine />)</span>
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
                                <div className="cardTitle">Add a point</div>
                            </div>
                        </div>

                        <form className="form" onSubmit={addPoint}>
                            <label className="field">
                                <span>delay (0…<TenPowNine />)</span>
                                <input
                                    value={delayInput}
                                    onChange={(e) => setDelayInput(e.target.value)}
                                    placeholder="0..10^9"
                                    inputMode="numeric"
                                    className={!delayValid ? "bad" : ""}
                                />
                            </label>

                            <label className="field">
                                <span>area (0…<TenPowNine />)</span>
                                <input
                                    value={areaInput}
                                    onChange={(e) => setAreaInput(e.target.value)}
                                    placeholder="0..10^9"
                                    inputMode="numeric"
                                    className={!areaValid ? "bad" : ""}
                                />
                            </label>

                            <label className="field">
                                <span>file (.bench)</span>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".bench"
                                    onChange={onFileChange}
                                    className={benchFile && !fileIsValid ? "bad" : ""}
                                />
                            </label>

                            <button className="btn primary" type="submit" disabled={!canAdd}>
                                Add
                            </button>
                        </form>
                    </section>

                    <section className="card listCard">
                        <div className="cardHeader tight">
                            <div>
                                <div className="cardTitle">Points</div>
                            </div>
                        </div>

                        {points.length === 0 ? (
                            <div className="empty">No points yet.</div>
                        ) : (
                            <div className="list">
                                {points.map((p, idx) => (
                                    <div className="row" key={p.id}>
                                        <div className="rowLeft">
                                            <div className="badge">#{points.length - idx}</div>
                                            <div className="mono">
                                                delay=<b>{formatIntNoGrouping(p.delay)}</b>, area=<b>{formatIntNoGrouping(p.area)}</b>
                                                {p.fileName ? (
                                                    <>
                                                        {" "}
                                                        <span style={{ color: "#6b7280" }}>•</span>{" "}
                                                        <span style={{ color: "#6b7280" }}>{p.fileName}</span>
                                                    </>
                                                ) : null}
                                            </div>
                                        </div>
                                        <button className="btn danger" onClick={() => deletePoint(p.id)}>
                                            Delete
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                </aside>
            </main>

            <footer className="footer" />
        </div>
    );
}

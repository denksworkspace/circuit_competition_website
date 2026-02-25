// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
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
import { CustomTooltip } from "../CustomTooltip.jsx";
import { Diamond } from "../Diamond.jsx";
import { TenPowNine } from "../TenPowNine.jsx";
import { commandColor, statusColor } from "../../utils/pointUtils.js";

export function ChartSection({
    isTestBenchSelected,
    onGenerateRandomTestPoints,
    onClearAllTestNoConfirm,
    onDownloadBenchmarksExcel,
    delayOverflowLane,
    areaOverflowLane,
    delayAxis,
    areaAxis,
    formatDelayTick,
    formatAreaTick,
    areaAxisWidth,
    paretoDisplay,
    pointsRenderKey,
    plottedPoints,
    colorMode,
    commandByName,
    lastAddedId,
    onOpenPointActionModal,
    applyView,
    delayMaxDraft,
    onDelayMaxDraftChange,
    areaMaxDraft,
    onAreaMaxDraftChange,
    delayViewValid,
    areaViewValid,
    canApplyView,
    onFitViewToPareto,
    onFitViewToAllVisiblePoints,
    truthTableOn,
}) {
    return (
        <section className="card chartCard">
            <div className="cardHeader">
                <div>
                    <div className="cardTitleRow">
                        <div className="cardTitle">Pareto curve</div>
                        <div className="helpTipWrap" tabIndex={0} aria-label="Pareto frontier help">
                            <span className="helpTipIcon">?</span>
                            <div className="helpTipPanel">
                                <div className="cardHint">
                                    Pareto frontier is computed from points visible by benchmark + status filters.
                                </div>
                                <div className="cardHint">
                                    Changing the view rectangle does not change the frontier - it only crops what
                                    part of it is visible.
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="cardHint">
                        Click any point on the chart to open actions: <b>Download</b>, <b>Test</b>, and <b>Delete</b>.
                    </div>
                </div>

                <div className="toolbar">
                    <span className="pill">
                        <span className="dot" style={{ background: truthTableOn ? "#16a34a" : "#dc2626" }} />
                        {truthTableOn ? "truth table on" : "truth table off"}
                    </span>
                    {isTestBenchSelected ? (
                        <>
                            <button className="btn ghost" onClick={onGenerateRandomTestPoints}>
                                Generate random points
                            </button>
                            <button className="btn danger" onClick={onClearAllTestNoConfirm}>
                                Clear all (test)
                            </button>
                        </>
                    ) : null}

                    <button className="btn ghost" onClick={onDownloadBenchmarksExcel}>
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
                                const r = isLatest ? r0 * 1.5 : r0;

                                const fill = baseFill;

                                const onClick = () => onOpenPointActionModal(payload.id);

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

            <form className="viewControls" onSubmit={applyView}>
                <div className="viewTitle">View rectange</div>

                <label className="field compact">
                    <span>
                        delay max (≤ <TenPowNine />)
                    </span>
                    <input
                        value={delayMaxDraft}
                        onChange={(e) => onDelayMaxDraftChange(e.target.value)}
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
                        onChange={(e) => onAreaMaxDraftChange(e.target.value)}
                        placeholder="positive integer"
                        inputMode="numeric"
                        className={!areaViewValid ? "bad" : ""}
                    />
                </label>

                <button className="btn primary" type="submit" disabled={!canApplyView}>
                    Apply
                </button>

                <div className="viewAutoActions">
                    <button className="btn primary" type="button" onClick={onFitViewToPareto}>
                        Fit Pareto
                    </button>
                    <button className="btn primary" type="button" onClick={onFitViewToAllVisiblePoints}>
                        Fit All Points
                    </button>
                </div>
            </form>
        </section>
    );
}

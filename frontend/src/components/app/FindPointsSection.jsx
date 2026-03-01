// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { DELETE_PREVIEW_LIMIT } from "../../constants/appConstants.js";
import { statusColor } from "../../utils/pointUtils.js";
import { formatIntNoGrouping } from "../../utils/numberUtils.js";

export function FindPointsSection({
    deletePrefix,
    onDeletePrefixChange,
    deletePreview,
    placeholdersCount,
    deleteMatches,
    deleteHasMore,
    onFocusPoint,
    onDownloadCircuit,
    getPointDownloadUrl,
    canTestPoint,
    onTestPoint,
    selectedTestChecker,
    onSelectedTestCheckerChange,
    testingPointId,
    testingPointLabel,
    canDeletePoint,
    onConfirmAndDeletePoint,
}) {
    return (
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
                        onChange={(e) => onDeletePrefixChange(e.target.value)}
                        placeholder="e.g. bench256_123"
                    />
                </label>
                <label className="field">
                    <span>test checker</span>
                    <select value={selectedTestChecker} onChange={(e) => onSelectedTestCheckerChange(e.target.value)}>
                        <option value="ABC">ABC</option>
                        <option value="ABC_FAST_HEX">ABC fast hex</option>
                    </select>
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

                        <button className="btn ghost small" onClick={() => onFocusPoint(p)}>
                            Find
                        </button>
                        <button
                            className="btn ghost small"
                            onClick={() => onDownloadCircuit(p)}
                            disabled={!getPointDownloadUrl(p)}
                        >
                            Download circuit
                        </button>
                        {canTestPoint(p) ? (
                            <button
                                className="btn ghost small"
                                onClick={() => onTestPoint(p, selectedTestChecker)}
                                title={testingPointId === p.id ? (testingPointLabel || "Testing...") : "Test"}
                                style={testingPointId === p.id ? { color: "#6b7280" } : undefined}
                            >
                                {testingPointId === p.id ? (testingPointLabel || "Testing...") : "Test"}
                            </button>
                        ) : null}
                        {canDeletePoint(p) ? (
                            <button
                                className="btn danger small"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onConfirmAndDeletePoint(p.id);
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
    );
}

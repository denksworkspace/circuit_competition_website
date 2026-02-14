import { statusColor } from "../../utils/pointUtils.js";
import { formatIntNoGrouping } from "../../utils/numberUtils.js";

export function SentPointsSection({
    myPoints,
    sentPageItems,
    sentTotal,
    sentStart,
    sentPages,
    sentPageClamped,
    onSentPageChange,
    onFocusPoint,
    onDownloadCircuit,
    getPointDownloadUrl,
}) {
    return (
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
                                onClick={() => onSentPageChange(page)}
                            >
                                {page}
                            </button>
                        );
                    })}
                </div>
            ) : null}
        </section>
    );
}

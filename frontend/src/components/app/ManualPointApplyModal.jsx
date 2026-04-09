export function ManualPointApplyModal({
    open,
    rows,
    onToggle,
    onApply,
    onClose,
    isApplying,
    applyProgress,
}) {
    if (!open) return null;

    return (
        <div className="pointModalBackdrop">
            <div className="pointModal manualApplyModal" onClick={(e) => e.stopPropagation()}>
                <div className="manualApplyHeader">
                    <div className="pointModalTitle">Manual point apply</div>
                    <button className="btn ghost small" type="button" onClick={onClose} aria-label="Close">
                        x
                    </button>
                </div>

                <div className="manualApplyList">
                    {rows.map((row) => (
                        <label key={row.key} className="manualApplyItem">
                            <input
                                type="checkbox"
                                checked={Boolean(row.checked)}
                                onChange={(e) => onToggle(row.key, e.target.checked)}
                                disabled={isApplying || Boolean(row.disabled)}
                            />
                            <span>
                                Add point with bench={row.bench}, delay={row.delay}, area={row.area}, status={row.statusLabel}
                                {row.verdict ? `, detected verdict=${row.verdict}` : ""}
                                {row.verdictReason ? `, reason=${row.verdictReason}` : ""}
                                {row.reason ? `, source=${row.reason}` : ""}?
                            </span>
                        </label>
                    ))}
                </div>

                <div className="pointModalActions">
                    <button className="btn primary small" type="button" onClick={onApply} disabled={isApplying}>
                        {isApplying ? "Applying..." : "Apply"}
                    </button>
                </div>
                {isApplying && applyProgress ? (
                    <div className="cardHint">
                        processed {Number(applyProgress.processed || 0)} / {Number(applyProgress.total || 0)}
                    </div>
                ) : null}
            </div>
        </div>
    );
}

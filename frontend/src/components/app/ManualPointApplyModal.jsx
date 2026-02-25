export function ManualPointApplyModal({
    open,
    rows,
    onToggle,
    onApply,
    onClose,
    isApplying,
}) {
    if (!open) return null;

    return (
        <div className="pointModalBackdrop" onClick={onClose}>
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
                                disabled={isApplying}
                            />
                            <span>
                                Add point with delay={row.delay}, area={row.area}, verdict={row.verdict} to the chart?
                            </span>
                        </label>
                    ))}
                </div>

                <div className="pointModalActions">
                    <button className="btn primary small" type="button" onClick={onApply} disabled={isApplying}>
                        {isApplying ? "Applying..." : "Apply"}
                    </button>
                </div>
            </div>
        </div>
    );
}

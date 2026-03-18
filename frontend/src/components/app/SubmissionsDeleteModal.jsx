export function SubmissionsDeleteModal({
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
        <div className="pointModalBackdrop" onClick={onClose}>
            <div className="pointModal manualApplyModal" onClick={(e) => e.stopPropagation()}>
                <div className="manualApplyHeader">
                    <div className="pointModalTitle">Delete submissions</div>
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
                            <span>Delete point bench={row.benchmark}, delay={row.delay}, area={row.area}, file={row.fileName}?</span>
                        </label>
                    ))}
                </div>

                <div className="pointModalActions">
                    <button className="btn danger small" type="button" onClick={onApply} disabled={isApplying}>
                        {isApplying ? "Deleting..." : "Apply"}
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

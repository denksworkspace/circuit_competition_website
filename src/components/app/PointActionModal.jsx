// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
export function PointActionModal({
    actionPoint,
    closePointActionModal,
    onDownloadCircuit,
    getPointDownloadUrl,
    canTestPoint,
    onTestPoint,
    testingPointId,
    canDeletePoint,
    confirmAndDeletePoint,
}) {
    if (!actionPoint) return null;

    return (
        <div className="pointModalBackdrop" onClick={closePointActionModal}>
            <div className="pointModal" onClick={(e) => e.stopPropagation()}>
                <div className="pointModalTitle">Point actions</div>
                <div className="pointModalFile mono">{actionPoint.fileName}</div>
                <div className="pointModalActions">
                    <button
                        className="btn ghost small"
                        onClick={() => onDownloadCircuit(actionPoint)}
                        disabled={!getPointDownloadUrl(actionPoint)}
                    >
                        Download
                    </button>
                    {canTestPoint(actionPoint) ? (
                        <button
                            className="btn ghost small"
                            onClick={() => onTestPoint(actionPoint)}
                            disabled={testingPointId === actionPoint.id}
                        >
                            {testingPointId === actionPoint.id ? "Testing..." : "Test"}
                        </button>
                    ) : null}
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
    );
}

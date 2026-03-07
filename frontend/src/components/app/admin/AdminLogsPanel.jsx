// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
export function AdminLogsPanel({
    adminLogCommandQuery,
    onAdminLogCommandQueryChange,
    adminLogActionQuery,
    onAdminLogActionQueryChange,
    availableAdminLogActions,
    addSelectedAdminLogAction,
    selectedAdminLogActionSet,
    selectedAdminLogActions,
    removeSelectedAdminLogAction,
    adminLogPageItems,
    adminLogsTotal,
    adminLogsHasMore,
}) {
    return (
        <>
            <div className="cardHint">Latest action logs (all users):</div>

            <label className="field">
                <span>Search by command name</span>
                <input
                    value={adminLogCommandQuery}
                    onChange={(e) => onAdminLogCommandQueryChange(e.target.value)}
                    placeholder="Search by prefix..."
                />
            </label>

            <div className="userPicker adminActionPicker">
                <div className="userPickerTitle">Actions</div>
                <input
                    value={adminLogActionQuery}
                    onChange={(e) => onAdminLogActionQueryChange(e.target.value)}
                    placeholder="Search actions..."
                />
                <div className="userList">
                    {availableAdminLogActions
                        .filter((action) => {
                            const q = adminLogActionQuery.trim().toLowerCase();
                            if (!q) return true;
                            return action.toLowerCase().startsWith(q);
                        })
                        .map((action) => (
                            <button
                                key={action}
                                className="userItem"
                                type="button"
                                onClick={() => addSelectedAdminLogAction(action)}
                                disabled={selectedAdminLogActionSet.has(action)}
                                title={selectedAdminLogActionSet.has(action) ? "Already selected" : "Add"}
                            >
                                <span className="userItemName">{action}</span>
                            </button>
                        ))}
                </div>
                <div className="viewingBar">
                    <div className="viewingTitle">
                        Actions filter{" "}
                        {selectedAdminLogActions.length > 0
                            ? `(${selectedAdminLogActions.length} selected)`
                            : "(all actions)"}
                    </div>
                    <div className="chipsRow">
                        {selectedAdminLogActions.length === 0 ? (
                            <div className="mutedSmall">No actions selected - showing all.</div>
                        ) : (
                            selectedAdminLogActions.map((action) => (
                                <span key={action} className="tagChip">
                                    <span className="tagChipText">{action}</span>
                                    <button
                                        className="tagChipX"
                                        type="button"
                                        onClick={() => removeSelectedAdminLogAction(action)}
                                        aria-label={"Remove " + action}
                                        title="Remove"
                                    >
                                        x
                                    </button>
                                </span>
                            ))
                        )}
                    </div>
                </div>
            </div>

            <div className="list compactList adminLogsList">
                {adminLogsTotal === 0 ? (
                    <div className="empty">No logs.</div>
                ) : (
                    adminLogPageItems.map((log) => (
                        <div className="row compactRow" key={log.id}>
                            <div className="compactMain">
                                <div className="compactTop">
                                    <span className="pill subtle">{new Date(log.createdAt).toLocaleString()}</span>
                                    <span className="pill">{log.action}</span>
                                    <span className="pill">command: {log.targetName || "unknown"} (id: {log.commandId})</span>
                                    <span className="pill">actor: {log.actorName || "system"}</span>
                                </div>
                                <div className="compactBottom">
                                    <span className="mono mutedMono">{JSON.stringify(log.details || {})}</span>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
            {adminLogsHasMore ? (
                <div className="moreHint">Showing {adminLogPageItems.length} of {adminLogsTotal} matches.</div>
            ) : null}
        </>
    );
}

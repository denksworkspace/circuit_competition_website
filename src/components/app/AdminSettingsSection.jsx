// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
export function AdminSettingsSection({
    adminUserIdDraft,
    onAdminUserIdDraftChange,
    loadAdminUser,
    isAdminLoading,
    adminPanelError,
    adminUser,
    formatGb,
    adminSingleGbDraft,
    onAdminSingleGbDraftChange,
    adminTotalGbDraft,
    onAdminTotalGbDraftChange,
    adminBatchCountDraft,
    onAdminBatchCountDraftChange,
    saveAdminUserSettings,
    isAdminSaving,
    adminLogs,
}) {
    return (
        <section className="card">
            <div className="cardHeader tight">
                <div>
                    <div className="cardTitle">Admin: User settings</div>
                    <div className="cardHint">Search by user id and edit upload quotas.</div>
                </div>
            </div>

            <div className="form">
                <label className="field">
                    <span>User id</span>
                    <input
                        value={adminUserIdDraft}
                        onChange={(e) => onAdminUserIdDraftChange(e.target.value)}
                        inputMode="numeric"
                        placeholder="e.g. 7"
                    />
                </label>

                <button className="btn ghost" type="button" onClick={loadAdminUser} disabled={isAdminLoading}>
                    {isAdminLoading ? "Loading..." : "Load user"}
                </button>

                {adminPanelError ? <div className="error">{adminPanelError}</div> : null}

                {adminUser ? (
                    <>
                        <div className="cardHint">
                            User: <b>{adminUser.name}</b> (id: {adminUser.id}, role: {adminUser.role})
                        </div>
                        <div className="cardHint">
                            Used quota: {formatGb(adminUser.uploadedBytesTotal)} GB (deleting points does not refund).
                        </div>

                        <label className="field">
                            <span>Max single file (GB)</span>
                            <input
                                value={adminSingleGbDraft}
                                onChange={(e) => onAdminSingleGbDraftChange(e.target.value)}
                                inputMode="decimal"
                            />
                        </label>

                        <label className="field">
                            <span>Total quota (GB)</span>
                            <input
                                value={adminTotalGbDraft}
                                onChange={(e) => onAdminTotalGbDraftChange(e.target.value)}
                                inputMode="decimal"
                            />
                        </label>

                        <label className="field">
                            <span>Max files per multi-file batch</span>
                            <input
                                value={adminBatchCountDraft}
                                onChange={(e) => onAdminBatchCountDraftChange(e.target.value)}
                                inputMode="numeric"
                            />
                        </label>

                        <button
                            className="btn primary"
                            type="button"
                            onClick={saveAdminUserSettings}
                            disabled={isAdminSaving}
                        >
                            {isAdminSaving ? "Saving..." : "Save settings"}
                        </button>

                        <div className="cardHint">Latest action logs:</div>
                        <div className="list compactList">
                            {adminLogs.length === 0 ? (
                                <div className="empty">No logs.</div>
                            ) : (
                                adminLogs.slice(0, 20).map((log) => (
                                    <div className="row compactRow" key={log.id}>
                                        <div className="compactMain">
                                            <div className="compactTop">
                                                <span className="pill subtle">{new Date(log.createdAt).toLocaleString()}</span>
                                                <span className="pill">{log.action}</span>
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
                    </>
                ) : null}
            </div>
        </section>
    );
}

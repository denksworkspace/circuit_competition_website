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
    adminVerifyTleSecondsDraft,
    onAdminVerifyTleSecondsDraftChange,
    adminMetricsTleSecondsDraft,
    onAdminMetricsTleSecondsDraftChange,
    saveAdminUserSettings,
    isAdminSaving,
    isAdminQuotaSettingsOpen,
    onToggleAdminQuotaSettings,
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
    truthFilesInputRef,
    onTruthFilesChange,
    uploadTruthTables,
    isTruthUploading,
    truthUploadError,
    truthUploadLogText,
    truthUploadProgress,
    onDownloadTruthUploadLog,
    truthConflicts,
    isTruthConflictModalOpen,
    setTruthConflictChecked,
    selectAllTruthConflicts,
    clearAllTruthConflicts,
    applyTruthConflicts,
    closeTruthConflictModal,
    runBulkVerifyAllPoints,
    selectedBulkVerifyChecker,
    onSelectedBulkVerifyCheckerChange,
    bulkVerifyIncludeVerified,
    onBulkVerifyIncludeVerifiedChange,
    stopBulkVerifyAllPoints,
    isBulkVerifyRunning,
    bulkVerifyCurrentFileName,
    bulkVerifyProgress,
    bulkVerifyLogText,
    onDownloadBulkVerifyLog,
    runBulkMetricsAudit,
    stopBulkMetricsAudit,
    isBulkMetricsAuditRunning,
    bulkMetricsAuditCurrentFileName,
    bulkMetricsAuditProgress,
    bulkMetricsAuditLogText,
    onDownloadBulkMetricsAuditLog,
    bulkVerifyCandidates,
    isBulkVerifyApplyModalOpen,
    setBulkVerifyCandidateChecked,
    selectAllBulkVerifyCandidates,
    clearAllBulkVerifyCandidates,
    applySelectedBulkVerifyCandidates,
    closeBulkVerifyApplyModal,
}) {
    return (
        <section className="card">
            <div className="cardHeader tight">
                <div>
                    <div className="cardTitle">Admin logs</div>
                    <div className="cardHint">Settings are available via the gear icon.</div>
                </div>
                <button
                    type="button"
                    className="settingsGear"
                    onClick={onToggleAdminQuotaSettings}
                    aria-label="Open quota settings"
                    title="Quota settings"
                >
                    <svg className="settingsGearSvg" viewBox="0 0 16 16" aria-hidden="true">
                        <path fillRule="evenodd" clipRule="evenodd" d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.902 3.433 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.892 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.892-1.64-.902-3.434-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319ZM8 10.93a2.93 2.93 0 1 0 0-5.86 2.93 2.93 0 0 0 0 5.86Z" />
                    </svg>
                </button>
            </div>

            <div className="form">
                {isAdminQuotaSettingsOpen ? (
                    <div className="settingsPanel">
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

                                <label className="field">
                                    <span>TLE for checker (seconds)</span>
                                    <input
                                        value={adminVerifyTleSecondsDraft}
                                        onChange={(e) => onAdminVerifyTleSecondsDraftChange(e.target.value)}
                                        inputMode="numeric"
                                    />
                                </label>

                                <label className="field">
                                    <span>TLE for metrics audit (seconds)</span>
                                    <input
                                        value={adminMetricsTleSecondsDraft}
                                        onChange={(e) => onAdminMetricsTleSecondsDraftChange(e.target.value)}
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

                                <div className="cardHint">Truth tables (.truth)</div>
                                <label className="field">
                                    <span>Files</span>
                                    <input
                                        ref={truthFilesInputRef}
                                        type="file"
                                        accept=".truth"
                                        multiple
                                        onChange={onTruthFilesChange}
                                    />
                                </label>
                                {truthUploadError ? <div className="error">{truthUploadError}</div> : null}
                                <button
                                    className="btn primary"
                                    type="button"
                                    onClick={uploadTruthTables}
                                    disabled={isTruthUploading}
                                >
                                    {isTruthUploading ? "Uploading..." : "Upload truth files"}
                                </button>
                                {isTruthUploading && truthUploadProgress ? (
                                    <div className="cardHint">
                                        Processed {truthUploadProgress.done} / {truthUploadProgress.total} files
                                    </div>
                                ) : null}
                                {truthUploadLogText ? (
                                    <>
                                        <div className="cardHint mono mutedMono">{truthUploadLogText}</div>
                                        <button className="btn ghost" type="button" onClick={onDownloadTruthUploadLog}>
                                            Download truth upload log
                                        </button>
                                    </>
                                ) : null}

                                <div className="cardHint">Admin: bulk checks</div>
                                <label className="field">
                                    <span>bulk checker</span>
                                    <select
                                        value={selectedBulkVerifyChecker}
                                        onChange={(e) => onSelectedBulkVerifyCheckerChange(e.target.value)}
                                    >
                                        <option value="ABC">ABC</option>
                                        <option value="ABC_FAST_HEX">ABC fast hex</option>
                                    </select>
                                </label>
                                <label className="field">
                                    <span className="mono">
                                        <input
                                            type="checkbox"
                                            checked={bulkVerifyIncludeVerified}
                                            onChange={(e) => onBulkVerifyIncludeVerifiedChange(e.target.checked)}
                                        />
                                        {" "}Include points with status verified
                                    </span>
                                </label>
                                <button
                                    className="btn ghost"
                                    type="button"
                                    onClick={() => runBulkVerifyAllPoints(selectedBulkVerifyChecker)}
                                    disabled={isBulkVerifyRunning}
                                >
                                    {isBulkVerifyRunning ? "Checking all points..." : "Check all points"}
                                </button>
                                {isBulkVerifyRunning ? (
                                    <button className="btn danger" type="button" onClick={stopBulkVerifyAllPoints}>
                                        Stop check
                                    </button>
                                ) : null}
                                {isBulkVerifyRunning && bulkVerifyProgress ? (
                                    <div className="cardHint">
                                        Processed {bulkVerifyProgress.done} / {bulkVerifyProgress.total} points
                                    </div>
                                ) : null}
                                {isBulkVerifyRunning && bulkVerifyCurrentFileName ? (
                                    <div className="cardHint">
                                        Current file: <span className="mono">{bulkVerifyCurrentFileName}</span>
                                    </div>
                                ) : null}
                                {bulkVerifyLogText ? (
                                    <>
                                        <button className="btn ghost" type="button" onClick={onDownloadBulkVerifyLog}>
                                            Download bulk-check log
                                        </button>
                                    </>
                                ) : null}

                                <button
                                    className="btn ghost"
                                    type="button"
                                    onClick={runBulkMetricsAudit}
                                    disabled={isBulkMetricsAuditRunning}
                                >
                                    {isBulkMetricsAuditRunning ? "Auditing..." : "Audit all point metrics (ABC)"}
                                </button>
                                {isBulkMetricsAuditRunning ? (
                                    <button className="btn danger" type="button" onClick={stopBulkMetricsAudit}>
                                        Stop Audit
                                    </button>
                                ) : null}
                                {isBulkMetricsAuditRunning && bulkMetricsAuditProgress ? (
                                    <div className="cardHint">
                                        Processed {bulkMetricsAuditProgress.done} / {bulkMetricsAuditProgress.total} points
                                    </div>
                                ) : null}
                                {isBulkMetricsAuditRunning && bulkMetricsAuditCurrentFileName ? (
                                    <div className="cardHint">
                                        Current file: <span className="mono">{bulkMetricsAuditCurrentFileName}</span>
                                    </div>
                                ) : null}
                                {bulkMetricsAuditLogText ? (
                                    <>
                                        <button className="btn ghost" type="button" onClick={onDownloadBulkMetricsAuditLog}>
                                            Download metrics audit log
                                        </button>
                                    </>
                                ) : null}
                            </>
                        ) : null}
                    </div>
                ) : null}

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
            </div>

            {isTruthConflictModalOpen ? (
                <div className="pointModalBackdrop" onClick={closeTruthConflictModal}>
                    <div className="pointModal truthConflictModal" onClick={(e) => e.stopPropagation()}>
                        <div className="pointModalTitle">Resolve truth upload conflicts</div>
                        <div className="truthConflictList">
                            {truthConflicts.length === 0 ? (
                                <div className="empty">No conflicts.</div>
                            ) : (
                                truthConflicts.map((item) => (
                                    <label className="truthConflictItem" key={item.fileName}>
                                        <input
                                            type="checkbox"
                                            checked={Boolean(item.checked)}
                                            onChange={(e) => setTruthConflictChecked(item.fileName, e.target.checked)}
                                        />
                                        <span>
                                            {item.action === "requires_replace"
                                                ? `Replace .truth in benchmark ${item.benchmark}?`
                                                : `Add new benchmark ${item.benchmark}?`}
                                        </span>
                                    </label>
                                ))
                            )}
                        </div>
                        <div className="pointModalActions">
                            <button className="btn ghost small" type="button" onClick={selectAllTruthConflicts}>
                                Select all
                            </button>
                            <button className="btn ghost small" type="button" onClick={clearAllTruthConflicts}>
                                Clear all
                            </button>
                            <button className="btn primary small" type="button" onClick={applyTruthConflicts}>
                                Apply
                            </button>
                            <button className="btn small" type="button" onClick={closeTruthConflictModal}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {isBulkVerifyApplyModalOpen ? (
                <div className="pointModalBackdrop" onClick={closeBulkVerifyApplyModal}>
                    <div className="pointModal truthConflictModal" onClick={(e) => e.stopPropagation()}>
                        <div className="pointModalTitle">Apply bulk verification statuses</div>
                        <div className="truthConflictList">
                            {bulkVerifyCandidates.length === 0 ? (
                                <div className="empty">No candidates.</div>
                            ) : (
                                bulkVerifyCandidates.map((item) => (
                                    <label className="truthConflictItem" key={item.pointId}>
                                        <input
                                            type="checkbox"
                                            checked={Boolean(item.checked)}
                                            onChange={(e) => setBulkVerifyCandidateChecked(item.pointId, e.target.checked)}
                                        />
                                        <span>
                                            point {item.pointId} ({item.fileName}) -&gt; {item.status}
                                        </span>
                                    </label>
                                ))
                            )}
                        </div>
                        <div className="pointModalActions">
                            <button className="btn ghost small" type="button" onClick={selectAllBulkVerifyCandidates}>
                                Select all
                            </button>
                            <button className="btn ghost small" type="button" onClick={clearAllBulkVerifyCandidates}>
                                Clear all
                            </button>
                            <button className="btn primary small" type="button" onClick={applySelectedBulkVerifyCandidates}>
                                Apply selected
                            </button>
                            <button className="btn small" type="button" onClick={closeBulkVerifyApplyModal}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </section>
    );
}

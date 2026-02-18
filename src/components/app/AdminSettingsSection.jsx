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
    isBulkVerifyRunning,
    bulkVerifyProgress,
    bulkVerifyLogText,
    onDownloadBulkVerifyLog,
    runBulkMetricsAudit,
    isBulkMetricsAuditRunning,
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
                        <button
                            className="btn ghost"
                            type="button"
                            onClick={runBulkVerifyAllPoints}
                            disabled={isBulkVerifyRunning}
                        >
                            {isBulkVerifyRunning ? "Checking all points..." : "Check all points (CEC)"}
                        </button>
                        {isBulkVerifyRunning && bulkVerifyProgress ? (
                            <div className="cardHint">
                                Processed {bulkVerifyProgress.done} / {bulkVerifyProgress.total} points
                            </div>
                        ) : null}
                        {bulkVerifyLogText ? (
                            <button className="btn ghost" type="button" onClick={onDownloadBulkVerifyLog}>
                                Download CEC log
                            </button>
                        ) : null}

                        <button
                            className="btn ghost"
                            type="button"
                            onClick={runBulkMetricsAudit}
                            disabled={isBulkMetricsAuditRunning}
                        >
                            {isBulkMetricsAuditRunning ? "Auditing..." : "Audit all point metrics (ABC)"}
                        </button>
                        {isBulkMetricsAuditRunning && bulkMetricsAuditProgress ? (
                            <div className="cardHint">
                                Processed {bulkMetricsAuditProgress.done} / {bulkMetricsAuditProgress.total} points
                            </div>
                        ) : null}
                        {bulkMetricsAuditLogText ? (
                            <button className="btn ghost" type="button" onClick={onDownloadBulkMetricsAuditLog}>
                                Download metrics audit log
                            </button>
                        ) : null}

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

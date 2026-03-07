// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
export function AdminSettingsPanel({
    adminUserIdDraft,
    onAdminUserIdDraftChange,
    loadAdminUser,
    downloadAllSchemesZip,
    downloadDatabaseExport,
    isAdminLoading,
    isAdminSchemesExporting,
    isAdminDbExporting,
    adminSchemesExportProgress,
    adminDbExportProgress,
    adminExportError,
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
    truthFilesInputRef,
    onTruthFilesChange,
    uploadTruthTables,
    isTruthUploading,
    truthUploadError,
    truthUploadLogText,
    truthUploadProgress,
    onDownloadTruthUploadLog,
    selectedBulkVerifyChecker,
    onSelectedBulkVerifyCheckerChange,
    bulkVerifyIncludeVerified,
    onBulkVerifyIncludeVerifiedChange,
    runBulkVerifyAllPoints,
    isBulkVerifyRunning,
    stopBulkVerifyAllPoints,
    bulkVerifyProgress,
    bulkVerifyCurrentFileName,
    bulkVerifyLogText,
    onDownloadBulkVerifyLog,
    runBulkMetricsAudit,
    isBulkMetricsAuditRunning,
    stopBulkMetricsAudit,
    bulkMetricsAuditProgress,
    bulkMetricsAuditCurrentFileName,
    bulkMetricsAuditLogText,
    onDownloadBulkMetricsAuditLog,
    runBulkIdenticalAudit,
    isBulkIdenticalAuditRunning,
    isBulkIdenticalApplying,
    stopBulkIdenticalAudit,
    bulkIdenticalAuditProgress,
    bulkIdenticalAuditCurrentFileName,
    bulkIdenticalAuditSummary,
    bulkIdenticalAuditLogText,
    onDownloadBulkIdenticalAuditLog,
}) {
    return (
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

            <div className="buttonRow">
                <button
                    className="btn ghost"
                    type="button"
                    onClick={downloadAllSchemesZip}
                    disabled={isAdminDbExporting}
                >
                    {isAdminSchemesExporting
                        ? `Stop schemes export (${Number(adminSchemesExportProgress?.done || 0)}/${Number(adminSchemesExportProgress?.total || 0)})`
                        : "Export schemes (.zip)"}
                </button>
                <button
                    className="btn ghost"
                    type="button"
                    onClick={downloadDatabaseExport}
                    disabled={isAdminSchemesExporting}
                >
                    {isAdminDbExporting
                        ? `Stop database export (${Number(adminDbExportProgress?.done || 0)}/${Number(adminDbExportProgress?.total || 0)})`
                        : "Export database"}
                </button>
            </div>
            {isAdminSchemesExporting ? (
                <div className="cardHint">
                    Schemes: {Number(adminSchemesExportProgress?.done || 0)} / {Number(adminSchemesExportProgress?.total || 0)} files
                    {" "}({String(adminSchemesExportProgress?.status || "queued")}, scope: {String(adminSchemesExportProgress?.scope || "all")})
                </div>
            ) : null}
            {isAdminDbExporting ? (
                <div className="cardHint">
                    Database: {Number(adminDbExportProgress?.done || 0)} / {Number(adminDbExportProgress?.total || 0)} tables
                    {" "}({String(adminDbExportProgress?.status || "queued")})
                </div>
            ) : null}
            {adminExportError ? <div className="error">{adminExportError}</div> : null}

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
                        <button className="btn ghost" type="button" onClick={onDownloadBulkVerifyLog}>
                            Download bulk-check log
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
                        <button className="btn ghost" type="button" onClick={onDownloadBulkMetricsAuditLog}>
                            Download metrics audit log
                        </button>
                    ) : null}

                    <button
                        className="btn ghost"
                        type="button"
                        onClick={runBulkIdenticalAudit}
                        disabled={isBulkIdenticalAuditRunning || isBulkIdenticalApplying}
                    >
                        {isBulkIdenticalAuditRunning ? "Auditing identical files..." : "Audit identical files"}
                    </button>
                    {isBulkIdenticalAuditRunning ? (
                        <button className="btn danger" type="button" onClick={stopBulkIdenticalAudit}>
                            Stop audit
                        </button>
                    ) : null}
                    {isBulkIdenticalAuditRunning && bulkIdenticalAuditProgress ? (
                        <div className="cardHint">
                            Processed {Number(bulkIdenticalAuditProgress.done || 0)} / {Number(bulkIdenticalAuditProgress.total || 0)} points
                        </div>
                    ) : null}
                    {isBulkIdenticalAuditRunning && bulkIdenticalAuditCurrentFileName ? (
                        <div className="cardHint">
                            Current file: <span className="mono">{bulkIdenticalAuditCurrentFileName}</span>
                        </div>
                    ) : null}
                    {bulkIdenticalAuditSummary ? (
                        <div className="cardHint">
                            Scanned {Number(bulkIdenticalAuditSummary.scannedPoints || 0)} points, duplicate groups: {Number(bulkIdenticalAuditSummary.groups || 0)}, failed downloads: {Number(bulkIdenticalAuditSummary.failedPoints || 0)}.
                        </div>
                    ) : null}
                    {bulkIdenticalAuditLogText ? (
                        <button className="btn ghost" type="button" onClick={onDownloadBulkIdenticalAuditLog}>
                            Download identical audit log
                        </button>
                    ) : null}
                </>
            ) : null}
        </div>
    );
}

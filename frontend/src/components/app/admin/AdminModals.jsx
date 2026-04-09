// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
export function AdminModals({
    truthConflicts,
    isTruthConflictModalOpen,
    setTruthConflictChecked,
    selectAllTruthConflicts,
    clearAllTruthConflicts,
    applyTruthConflicts,
    closeTruthConflictModal,
    isTruthUploading,
    truthUploadProgress,
    bulkVerifyCandidates,
    isBulkVerifyApplyModalOpen,
    isBulkVerifyApplying,
    bulkVerifyApplyProgress,
    setBulkVerifyCandidateChecked,
    selectAllBulkVerifyCandidates,
    clearAllBulkVerifyCandidates,
    applySelectedBulkVerifyCandidates,
    closeBulkVerifyApplyModal,
    bulkIdenticalGroups,
    isBulkIdenticalApplyModalOpen,
    isBulkIdenticalApplying,
    bulkIdenticalApplyProgress,
    setBulkIdenticalGroupKeepPoint,
    applySelectedBulkIdenticalGroups,
    closeBulkIdenticalApplyModal,
    isAdminSchemesExportModalOpen,
    closeAdminSchemesExportModal,
    adminSchemesExportScope,
    onAdminSchemesExportScopeChange,
    adminSchemesVerdictScope,
    onAdminSchemesVerdictScopeChange,
    startAdminSchemesExportFromModal,
}) {
    return (
        <>
            {isTruthConflictModalOpen ? (
                <div className="pointModalBackdrop">
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
                                            disabled={isTruthUploading}
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
                            <button className="btn ghost small" type="button" onClick={clearAllTruthConflicts} disabled={isTruthUploading}>
                                Clear all
                            </button>
                            <button className="btn primary small" type="button" onClick={applyTruthConflicts} disabled={isTruthUploading}>
                                {isTruthUploading ? "Applying..." : "Apply"}
                            </button>
                            <button className="btn small" type="button" onClick={closeTruthConflictModal} disabled={isTruthUploading}>
                                Close
                            </button>
                        </div>
                        {isTruthUploading && truthUploadProgress ? (
                            <div className="cardHint">
                                processed {Number(truthUploadProgress.done || 0)} / {Number(truthUploadProgress.total || 0)}
                            </div>
                        ) : null}
                    </div>
                </div>
            ) : null}

            {isBulkVerifyApplyModalOpen ? (
                <div className="pointModalBackdrop">
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
                                            disabled={isBulkVerifyApplying}
                                        />
                                        <span>
                                            point {item.pointId} ({item.fileName}) -&gt; {item.status}
                                            {item.verdict ? `; verdict=${item.verdict}` : ""}
                                            {item.reason ? `; reason=${item.reason}` : ""}
                                        </span>
                                    </label>
                                ))
                            )}
                        </div>
                        <div className="pointModalActions">
                            <button className="btn ghost small" type="button" onClick={selectAllBulkVerifyCandidates} disabled={isBulkVerifyApplying}>
                                Select all
                            </button>
                            <button className="btn ghost small" type="button" onClick={clearAllBulkVerifyCandidates} disabled={isBulkVerifyApplying}>
                                Clear all
                            </button>
                            <button className="btn primary small" type="button" onClick={applySelectedBulkVerifyCandidates} disabled={isBulkVerifyApplying}>
                                {isBulkVerifyApplying ? "Applying..." : "Apply selected"}
                            </button>
                            <button className="btn small" type="button" onClick={closeBulkVerifyApplyModal} disabled={isBulkVerifyApplying}>
                                Close
                            </button>
                        </div>
                        {isBulkVerifyApplying && bulkVerifyApplyProgress ? (
                            <div className="cardHint">
                                processed {Number(bulkVerifyApplyProgress.processed || 0)} / {Number(bulkVerifyApplyProgress.total || 0)}
                            </div>
                        ) : null}
                    </div>
                </div>
            ) : null}

            {isBulkIdenticalApplyModalOpen ? (
                <div className="pointModalBackdrop">
                    <div className="pointModal truthConflictModal" onClick={(e) => e.stopPropagation()}>
                        <div className="pointModalTitle">Resolve identical points</div>
                        <div className="cardHint">Choose one point to keep in each duplicate group. Others will be marked as deleted.</div>
                        <div className="truthConflictList identicalResolveList">
                            {bulkIdenticalGroups.length === 0 ? (
                                <div className="empty">No duplicate groups.</div>
                            ) : (
                                bulkIdenticalGroups.map((group) => {
                                    const points = Array.isArray(group.points) ? group.points : [];
                                    const keepPointId = String(group.keepPointId || points[0]?.id || "");
                                    return (
                                        <div className="identicalResolveRow" key={group.groupId}>
                                            <div className="identicalResolveMeta">
                                                <span className="pill subtle">group {group.groupId}</span>
                                                <span className="pill subtle">bench {group.benchmark}</span>
                                                <span className="pill subtle">duplicates {points.length}</span>
                                            </div>
                                            <div className="cardHint">reason: identical content hash</div>
                                            <label className="field identicalResolveField">
                                                <span>Keep point</span>
                                                <select
                                                    value={keepPointId}
                                                    onChange={(e) => setBulkIdenticalGroupKeepPoint(group.groupId, e.target.value)}
                                                    disabled={isBulkIdenticalApplying || points.length <= 1}
                                                >
                                                    {points.map((point) => {
                                                        const pointId = String(point?.id || "");
                                                        return (
                                                            <option key={pointId} value={pointId}>
                                                                {`bench=${point?.benchmark}; delay=${point?.delay}; area=${point?.area}; id=${pointId}`}
                                                            </option>
                                                        );
                                                    })}
                                                </select>
                                            </label>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                        <div className="pointModalActions">
                            <button className="btn primary small" type="button" onClick={applySelectedBulkIdenticalGroups} disabled={isBulkIdenticalApplying}>
                                {isBulkIdenticalApplying ? "Applying..." : "Apply"}
                            </button>
                            <button className="btn small" type="button" onClick={closeBulkIdenticalApplyModal} disabled={isBulkIdenticalApplying}>
                                Close
                            </button>
                        </div>
                        {isBulkIdenticalApplying && bulkIdenticalApplyProgress ? (
                            <div className="cardHint">
                                processed {Number(bulkIdenticalApplyProgress.processed || 0)} / {Number(bulkIdenticalApplyProgress.total || 0)}
                            </div>
                        ) : null}
                    </div>
                </div>
            ) : null}

            {isAdminSchemesExportModalOpen ? (
                <div className="pointModalBackdrop">
                    <div className="pointModal truthConflictModal" onClick={(e) => e.stopPropagation()}>
                        <div className="pointModalTitle">Schemes export options</div>
                        <div className="truthConflictList">
                            <label className="truthConflictItem">
                                <input
                                    type="checkbox"
                                    checked={adminSchemesExportScope === "pareto"}
                                    onChange={(e) => onAdminSchemesExportScopeChange(e.target.checked ? "pareto" : "all")}
                                />
                                <span>Pareto only (unchecked = all points)</span>
                            </label>
                            <label className="truthConflictItem">
                                <input
                                    type="checkbox"
                                    checked={adminSchemesVerdictScope === "all"}
                                    onChange={(e) => onAdminSchemesVerdictScopeChange(e.target.checked ? "all" : "verify")}
                                />
                                <span>Include all verdicts (unchecked = only verify)</span>
                            </label>
                        </div>
                        <div className="pointModalActions">
                            <button className="btn primary small" type="button" onClick={startAdminSchemesExportFromModal}>
                                Start export
                            </button>
                            <button className="btn small" type="button" onClick={closeAdminSchemesExportModal}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
}

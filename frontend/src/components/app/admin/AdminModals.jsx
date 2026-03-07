// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
export function AdminModals({
    truthConflicts,
    isTruthConflictModalOpen,
    setTruthConflictChecked,
    selectAllTruthConflicts,
    clearAllTruthConflicts,
    applyTruthConflicts,
    closeTruthConflictModal,
    bulkVerifyCandidates,
    isBulkVerifyApplyModalOpen,
    setBulkVerifyCandidateChecked,
    selectAllBulkVerifyCandidates,
    clearAllBulkVerifyCandidates,
    applySelectedBulkVerifyCandidates,
    closeBulkVerifyApplyModal,
    bulkIdenticalGroups,
    bulkIdenticalPickerGroupId,
    isBulkIdenticalApplyModalOpen,
    isBulkIdenticalApplying,
    setBulkIdenticalGroupChecked,
    openBulkIdenticalGroupPicker,
    closeBulkIdenticalGroupPicker,
    setBulkIdenticalGroupKeepPoint,
    selectAllBulkIdenticalGroups,
    clearAllBulkIdenticalGroups,
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

            {isBulkIdenticalApplyModalOpen ? (
                <div className="pointModalBackdrop" onClick={closeBulkIdenticalApplyModal}>
                    <div className="pointModal truthConflictModal" onClick={(e) => e.stopPropagation()}>
                        <div className="pointModalTitle">Resolve identical points</div>
                        <div className="truthConflictList">
                            {bulkIdenticalGroups.length === 0 ? (
                                <div className="empty">No duplicate groups.</div>
                            ) : (
                                bulkIdenticalGroups.map((group) => {
                                    const points = Array.isArray(group.points) ? group.points : [];
                                    const keepPointId = String(group.keepPointId || points[0]?.id || "");
                                    const keepPoint = points.find((point) => String(point?.id || "") === keepPointId) || points[0] || null;
                                    return (
                                        <div className="truthConflictItem" key={group.groupId}>
                                            <label className="truthConflictItem">
                                                <input
                                                    type="checkbox"
                                                    checked={Boolean(group.checked)}
                                                    onChange={(e) => setBulkIdenticalGroupChecked(group.groupId, e.target.checked)}
                                                    disabled={isBulkIdenticalApplying}
                                                />
                                                <span>
                                                    Group {group.groupId}, benchmark {group.benchmark}, duplicates {points.length}, hash {String(group.hash || "").slice(0, 16)}
                                                </span>
                                            </label>
                                            {keepPoint ? (
                                                <div className="cardHint">
                                                    Keep: {keepPoint.id} ({keepPoint.fileName}, delay={keepPoint.delay}, area={keepPoint.area}, sender={keepPoint.sender})
                                                </div>
                                            ) : null}
                                            <button
                                                className="btn ghost small"
                                                type="button"
                                                onClick={() => openBulkIdenticalGroupPicker(group.groupId)}
                                                disabled={isBulkIdenticalApplying || !group.checked || points.length <= 1}
                                            >
                                                Choose file to keep
                                            </button>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                        {bulkIdenticalPickerGroupId ? (
                            <div className="pointModal truthConflictModal" onClick={(e) => e.stopPropagation()}>
                                <div className="pointModalTitle">Choose point to keep</div>
                                <div className="truthConflictList">
                                    {(bulkIdenticalGroups.find((group) => group.groupId === bulkIdenticalPickerGroupId)?.points || []).map((point) => {
                                        const activeGroup = bulkIdenticalGroups.find((group) => group.groupId === bulkIdenticalPickerGroupId) || null;
                                        const currentKeepId = String(activeGroup?.keepPointId || activeGroup?.points?.[0]?.id || "");
                                        const pointId = String(point?.id || "");
                                        return (
                                            <label className="truthConflictItem" key={pointId}>
                                                <input
                                                    type="radio"
                                                    name={`keep-${bulkIdenticalPickerGroupId}`}
                                                    checked={pointId === currentKeepId}
                                                    onChange={() => setBulkIdenticalGroupKeepPoint(bulkIdenticalPickerGroupId, pointId)}
                                                    disabled={isBulkIdenticalApplying}
                                                />
                                                <span>
                                                    {point?.fileName} (bench={point?.benchmark}, delay={point?.delay}, area={point?.area}, sender={point?.sender})
                                                </span>
                                            </label>
                                        );
                                    })}
                                </div>
                                <div className="pointModalActions">
                                    <button className="btn small" type="button" onClick={closeBulkIdenticalGroupPicker} disabled={isBulkIdenticalApplying}>
                                        Close
                                    </button>
                                </div>
                            </div>
                        ) : null}
                        <div className="pointModalActions">
                            <button className="btn ghost small" type="button" onClick={selectAllBulkIdenticalGroups} disabled={isBulkIdenticalApplying}>
                                Select all
                            </button>
                            <button className="btn ghost small" type="button" onClick={clearAllBulkIdenticalGroups} disabled={isBulkIdenticalApplying}>
                                Clear all
                            </button>
                            <button className="btn primary small" type="button" onClick={applySelectedBulkIdenticalGroups} disabled={isBulkIdenticalApplying}>
                                {isBulkIdenticalApplying ? "Applying..." : "Apply selected"}
                            </button>
                            <button className="btn small" type="button" onClick={closeBulkIdenticalApplyModal} disabled={isBulkIdenticalApplying}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {isAdminSchemesExportModalOpen ? (
                <div className="pointModalBackdrop" onClick={closeAdminSchemesExportModal}>
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

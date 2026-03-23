// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { statusColor } from "../../utils/pointUtils.js";
import { formatIntNoGrouping } from "../../utils/numberUtils.js";

const PARETO_FRONT_ONLY_LABEL = "pareto front only";

export function SentPointsSection({
    myPoints,
    sentPageItems,
    sentTotal,
    sentStart,
    sentPages,
    sentPageClamped,
    onSentPageChange,
    onFocusPoint,
    onDownloadCircuit,
    getPointDownloadUrl,
    submissionStatusFilter,
    toggleSubmissionStatus,
    submissionBenchmarkFilter,
    submissionBenchmarkMenuRef,
    submissionBenchmarkMenuOpen,
    submissionBenchmarkInputValue,
    onSubmissionBenchmarkInputChange,
    onSubmissionBenchmarkInputFocus,
    onSubmissionBenchmarkInputBlur,
    onSubmissionBenchmarkInputKeyDown,
    submissionBenchmarkInputSuggestions,
    onSelectSubmissionBenchmark,
    submissionSortOrder,
    onSubmissionSortOrderChange,
    submissionParetoOnly,
    onSubmissionParetoOnlyChange,
    selectedSubmissionIdSet,
    onToggleSubmissionSelected,
    onOpenDeleteSelectedModal,
    onResetSubmissionSelection,
}) {
    return (
        <section className="card listCard sentCard">
            <div className="cardHeader tight">
                <div>
                    <div className="cardTitleRow">
                        <div className="cardTitle">Sended points</div>
                        <div className="helpTipWrap" tabIndex={0} aria-label="Submissions delete help">
                            <span className="helpTipIcon">?</span>
                            <div className="helpTipPanel">
                                <div className="cardHint">
                                    To delete points, click submissions to select them (they will be highlighted in blue), then click Delete.
                                </div>
                                <div className="cardHint">
                                    <b>Warning: selection is not reset when filters in this window are changed.</b>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                {selectedSubmissionIdSet.size > 0 ? (
                    <div className="sentHeaderActions">
                        <button className="btn ghost small" type="button" onClick={onResetSubmissionSelection}>
                            Reset selection
                        </button>
                        <button className="btn danger small" type="button" onClick={onOpenDeleteSelectedModal}>
                            Delete ({selectedSubmissionIdSet.size})
                        </button>
                    </div>
                ) : null}
            </div>

            <div className="form sentFiltersForm">
                <div className="sentFiltersLayout">
                    <label className="field">
                        <span>Status</span>
                        <div className="checks">
                            <label className="check compactCheck">
                                <input
                                    type="checkbox"
                                    checked={submissionStatusFilter["non-verified"]}
                                    onChange={() => toggleSubmissionStatus("non-verified")}
                                />
                                <span className="dot" style={{ background: statusColor("non-verified") }} />
                                <span>non-verified</span>
                            </label>
                            <label className="check compactCheck">
                                <input
                                    type="checkbox"
                                    checked={submissionStatusFilter.verified}
                                    onChange={() => toggleSubmissionStatus("verified")}
                                />
                                <span className="dot" style={{ background: statusColor("verified") }} />
                                <span>verified</span>
                            </label>
                            <label className="check compactCheck">
                                <input
                                    type="checkbox"
                                    checked={submissionStatusFilter.failed}
                                    onChange={() => toggleSubmissionStatus("failed")}
                                />
                                <span className="dot" style={{ background: statusColor("failed") }} />
                                <span>failed</span>
                            </label>
                        </div>
                    </label>

                    <div className="sentFiltersRight">
                        <label className="field">
                            <span>Benchmark</span>
                            <div className="benchmarkDropdown" ref={submissionBenchmarkMenuRef}>
                                <input
                                    value={submissionBenchmarkInputValue}
                                    onChange={(e) => onSubmissionBenchmarkInputChange(String(e.target.value || ""))}
                                    onFocus={onSubmissionBenchmarkInputFocus}
                                    onBlur={onSubmissionBenchmarkInputBlur}
                                    onKeyDown={onSubmissionBenchmarkInputKeyDown}
                                    placeholder={submissionBenchmarkFilter}
                                    aria-label="Submission benchmark"
                                    aria-expanded={submissionBenchmarkMenuOpen ? "true" : "false"}
                                />
                                {submissionBenchmarkMenuOpen ? (
                                    <div className="benchmarkMenu" role="listbox">
                                        {submissionBenchmarkInputSuggestions.length === 0 ? (
                                            <div className="cardHint benchmarkEmpty">No benchmark by prefix.</div>
                                        ) : submissionBenchmarkInputSuggestions.map((option) => (
                                            <button
                                                key={option}
                                                className="benchmarkOption"
                                                type="button"
                                                onMouseDown={(e) => e.preventDefault()}
                                                onClick={() => onSelectSubmissionBenchmark(String(option))}
                                            >
                                                {option}
                                            </button>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        </label>

                        <label className="field">
                            <span>Sort by upload date</span>
                            <select value={submissionSortOrder} onChange={(e) => onSubmissionSortOrderChange(e.target.value)}>
                                <option value="desc">newest first</option>
                                <option value="asc">oldest first</option>
                            </select>
                        </label>

                        <label className="check compactCheck">
                            <input
                                type="checkbox"
                                checked={submissionParetoOnly}
                                onChange={(e) => onSubmissionParetoOnlyChange(Boolean(e.target.checked))}
                            />
                            <span className="paretoOnlyText">{PARETO_FRONT_ONLY_LABEL}</span>
                        </label>
                    </div>
                </div>
            </div>

            <div className="list compactList">
                {myPoints.length === 0 ? (
                    <div className="empty">No points from your command.</div>
                ) : (
                    sentPageItems.map((p, i) => {
                        const globalIndex = sentTotal - (sentStart + i);
                        const isSelected = selectedSubmissionIdSet.has(p.id);
                        return (
                            <div
                                className={isSelected ? "row compactRow selectedSubmissionRow" : "row compactRow"}
                                key={p.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => onToggleSubmissionSelected(p.id)}
                                onKeyDown={(e) => {
                                    if (e.key !== "Enter" && e.key !== " ") return;
                                    e.preventDefault();
                                    onToggleSubmissionSelected(p.id);
                                }}
                            >
                                <div className="compactMain">
                                    <div className="compactTop">
                                        <span className="pill">benchmark: {p.benchmark}</span>
                                        <span className="pill">
                                            <span className="dot" style={{ background: statusColor(p.status) }} />
                                            {p.status}
                                        </span>
                                    </div>

                                    <div className="compactBottom">
                                        <span className="sentSubmission">submission: {globalIndex}</span>
                                        <span className="mono">
                                            delay=<b>{formatIntNoGrouping(p.delay)}</b>
                                        </span>
                                        <span className="mono">
                                            area=<b>{formatIntNoGrouping(p.area)}</b>
                                        </span>
                                    </div>
                                </div>

                                <div className="sentActions">
                                    <button
                                        className="btn ghost small"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onFocusPoint(p);
                                        }}
                                    >
                                        Find
                                    </button>
                                    <button
                                        className="btn ghost small"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onDownloadCircuit(p);
                                        }}
                                        disabled={!getPointDownloadUrl(p)}
                                    >
                                        Download circuit
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {myPoints.length > 0 ? (
                <div className="sentPagerNumbers">
                    {sentPages.map((page) => {
                        const isActive = page === sentPageClamped;
                        return (
                            <button
                                key={page}
                                className={isActive ? "pagerNum active" : "pagerNum"}
                                type="button"
                                onClick={() => onSentPageChange(page)}
                            >
                                {page}
                            </button>
                        );
                    })}
                </div>
            ) : null}
        </section>
    );
}

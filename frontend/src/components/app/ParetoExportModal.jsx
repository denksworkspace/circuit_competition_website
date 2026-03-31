// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { statusColor } from "../../utils/pointUtils.js";

export function ParetoExportModal({
    open,
    dateMode,
    onDateModeChange,
    fromDate,
    onFromDateChange,
    fromDateMin,
    fromDateMax,
    effectiveStartLabel,
    benchLabel,
    benchMenuRef,
    benchMenuOpen,
    benchInputValue,
    onBenchInputChange,
    onBenchInputFocus,
    onBenchInputBlur,
    onBenchInputKeyDown,
    benchInputSuggestions,
    onSelectBench,
    paretoOnly,
    onParetoOnlyChange,
    statusFilter,
    onToggleStatus,
    isExporting,
    exportProgress,
    onDownload,
    onClose,
    error,
}) {
    if (!open) return null;

    return (
        <div className="pointModalBackdrop" onClick={onClose}>
            <div className="pointModal truthConflictModal" onClick={(e) => e.stopPropagation()}>
                <div className="pointModalTitle">Export points</div>

                <label className="field">
                    <span>Date (UTC)</span>
                    <select
                        value={dateMode}
                        onChange={(e) => onDateModeChange(String(e.target.value || "since_last_export"))}
                        disabled={isExporting}
                    >
                        <option value="since_last_export">Since last export</option>
                        <option value="custom_date">Choose date</option>
                    </select>
                    {dateMode === "custom_date" ? (
                        <input
                            type="date"
                            value={fromDate}
                            onChange={(e) => onFromDateChange(String(e.target.value || ""))}
                            min={fromDateMin}
                            max={fromDateMax}
                            disabled={isExporting}
                        />
                    ) : null}
                    <span className="cardHint">Upload from: {effectiveStartLabel}</span>
                </label>

                <label className="field">
                    <span>Benchmark</span>
                    <div className="benchmarkDropdown" ref={benchMenuRef}>
                        <input
                            value={benchInputValue}
                            onChange={(e) => onBenchInputChange(String(e.target.value || ""))}
                            onFocus={onBenchInputFocus}
                            onBlur={onBenchInputBlur}
                            onKeyDown={onBenchInputKeyDown}
                            placeholder={benchLabel}
                            aria-label="Export benchmark"
                            aria-expanded={benchMenuOpen ? "true" : "false"}
                            disabled={isExporting}
                        />

                        {benchMenuOpen ? (
                            <div className="benchmarkMenu" role="listbox">
                                {benchInputSuggestions.length === 0 ? (
                                    <div className="cardHint benchmarkEmpty">No benchmark by prefix.</div>
                                ) : benchInputSuggestions.map((value) => (
                                    <button
                                        key={value}
                                        className="benchmarkOption"
                                        type="button"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => onSelectBench(String(value))}
                                        disabled={isExporting}
                                    >
                                        {value}
                                    </button>
                                ))}
                            </div>
                        ) : null}
                    </div>
                </label>

                <label className="check compactCheck">
                    <input
                        type="checkbox"
                        checked={paretoOnly}
                        onChange={(e) => onParetoOnlyChange(Boolean(e.target.checked))}
                        disabled={isExporting}
                    />
                    <span className="paretoOnlyText">Pareto points only</span>
                </label>

                <label className="field">
                    <span>Point statuses</span>
                    <div className="checks">
                        <label className="check compactCheck">
                            <input
                                type="checkbox"
                                checked={Boolean(statusFilter?.["non-verified"])}
                                onChange={() => onToggleStatus("non-verified")}
                                disabled={isExporting}
                            />
                            <span className="dot" style={{ background: statusColor("non-verified") }} />
                            <span>non-verified</span>
                        </label>
                        <label className="check compactCheck">
                            <input
                                type="checkbox"
                                checked={Boolean(statusFilter?.verified)}
                                onChange={() => onToggleStatus("verified")}
                                disabled={isExporting}
                            />
                            <span className="dot" style={{ background: statusColor("verified") }} />
                            <span>verified</span>
                        </label>
                        <label className="check compactCheck">
                            <input
                                type="checkbox"
                                checked={Boolean(statusFilter?.failed)}
                                onChange={() => onToggleStatus("failed")}
                                disabled={isExporting}
                            />
                            <span className="dot" style={{ background: statusColor("failed") }} />
                            <span>failed</span>
                        </label>
                    </div>
                </label>

                {error ? <div className="error">{error}</div> : null}
                {isExporting && exportProgress ? (
                    <div className="cardHint">
                        processed {Number(exportProgress.done || 0)} / {Number(exportProgress.total || 0)},
                        {" "}downloaded {Number(exportProgress.downloaded || 0)}
                    </div>
                ) : null}

                <div className="pointModalActions">
                    <button className="btn primary small" type="button" onClick={onDownload} disabled={isExporting}>
                        {isExporting ? "Downloading..." : "Download"}
                    </button>
                    <button className="btn small" type="button" onClick={onClose} disabled={isExporting}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}

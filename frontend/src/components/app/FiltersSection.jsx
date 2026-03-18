// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { commandColor, statusColor } from "../../utils/pointUtils.js";

const PARETO_FRONT_ONLY_LABEL = "pareto front only";

export function FiltersSection({
    benchmarkMenuRef,
    benchmarkMenuOpen,
    benchmarkLabel,
    benchmarkInputValue,
    onBenchmarkInputChange,
    onBenchmarkInputFocus,
    onBenchmarkInputBlur,
    onBenchmarkInputKeyDown,
    benchmarkInputSuggestions,
    onSelectBenchmark,
    colorMode,
    onColorModeChange,
    commandQuery,
    onCommandQueryChange,
    availableCommandNames,
    addSelectedCommand,
    selectedCommandSet,
    selectedCommands,
    commandByName,
    removeSelectedCommand,
    statusFilter,
    toggleStatus,
    showParetoOnly,
    onShowParetoOnlyChange,
}) {
    return (
        <section className="card">
            <div className="cardHeader tight">
                <div>
                    <div className="cardTitle">Filters</div>
                </div>
            </div>

            <div className="form">
                <label className="field">
                    <span className="fieldLabelWithHelp">
                        <span>Benchmark</span>
                        <span className="helpTipWrap" tabIndex={0} aria-label="Benchmark selection help">
                            <span className="helpTipIcon">?</span>
                            <span className="helpTipPanel">
                                <span className="cardHint">To select a benchmark, type its number.</span>
                                <span className="cardHint">The list shows all options matching the typed prefix.</span>
                            </span>
                        </span>
                    </span>
                    <div className="benchmarkDropdown" ref={benchmarkMenuRef}>
                        <input
                            value={benchmarkInputValue}
                            onChange={(e) => onBenchmarkInputChange(e.target.value)}
                            onFocus={onBenchmarkInputFocus}
                            onBlur={onBenchmarkInputBlur}
                            onKeyDown={onBenchmarkInputKeyDown}
                            placeholder={benchmarkLabel}
                            aria-label="Benchmark"
                            aria-expanded={benchmarkMenuOpen ? "true" : "false"}
                        />

                        {benchmarkMenuOpen ? (
                            <div className="benchmarkMenu" role="listbox">
                                {benchmarkInputSuggestions.length === 0 ? (
                                    <div className="cardHint benchmarkEmpty">No benchmark by prefix.</div>
                                ) : benchmarkInputSuggestions.map((value) => (
                                    <button
                                        key={value}
                                        className="benchmarkOption"
                                        type="button"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => onSelectBenchmark(String(value))}
                                    >
                                        {value}
                                    </button>
                                ))}
                            </div>
                        ) : null}
                    </div>
                </label>

                <label className="field">
                    <span>Color by</span>
                    <select value={colorMode} onChange={(e) => onColorModeChange(e.target.value)}>
                        <option value="status">Status</option>
                        <option value="users">Users</option>
                    </select>
                </label>

                <div className="field">
                    <span>Show statuses</span>

                    <div className={colorMode === "users" ? "statusUsersRow" : undefined}>
                        {colorMode === "users" ? (
                            <div className="userPicker">
                                <div className="userPickerTitle">Commands</div>

                                <input
                                    value={commandQuery}
                                    onChange={(e) => onCommandQueryChange(e.target.value)}
                                    placeholder="Search by prefix..."
                                />

                                <div className="userList">
                                    {availableCommandNames
                                        .filter((name) => {
                                            const q = commandQuery.trim().toLowerCase();
                                            if (!q) return true;
                                            return name.toLowerCase().startsWith(q);
                                        })
                                        .map((name) => {
                                            const col = commandColor(name, commandByName);
                                            return (
                                                <button
                                                    key={name}
                                                    className="userItem"
                                                    type="button"
                                                    onClick={() => addSelectedCommand(name)}
                                                    disabled={selectedCommandSet.has(name)}
                                                    title={selectedCommandSet.has(name) ? "Already selected" : "Add"}
                                                >
                                                    <span className="dot" style={{ background: col }} />
                                                    <span className="userItemName">{name}</span>
                                                </button>
                                            );
                                        })}
                                </div>

                                <div className="viewingBar">
                                    <div className="viewingTitle">
                                        Viewing{" "}
                                        {selectedCommands.length > 0
                                            ? `${selectedCommands.length} command${selectedCommands.length === 1 ? "" : "s"}`
                                            : "all commands"}
                                    </div>

                                    <div className="chipsRow">
                                        {selectedCommands.length === 0 ? (
                                            <div className="mutedSmall">
                                                No commands selected - showing all.
                                            </div>
                                        ) : (
                                            selectedCommands.map((name) => {
                                                const c = commandByName.get(name);
                                                const col = c ? c.color : commandColor(name, commandByName);
                                                return (
                                                    <span key={name} className="tagChip">
                                                        <span className="dot" style={{ background: col }} />
                                                        <span className="tagChipText">{name}</span>
                                                        <button
                                                            className="tagChipX"
                                                            type="button"
                                                            onClick={() => removeSelectedCommand(name)}
                                                            aria-label={"Remove " + name}
                                                            title="Remove"
                                                        >
                                                            x
                                                        </button>
                                                    </span>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : null}

                        <div className={colorMode === "users" ? "checks noDots" : "checks"}>
                            <label className="check">
                                <input
                                    type="checkbox"
                                    checked={statusFilter["non-verified"]}
                                    onChange={() => toggleStatus("non-verified")}
                                />
                                {colorMode !== "users" ? (
                                    <span className="dot" style={{ background: statusColor("non-verified") }} />
                                ) : null}
                                <span>non-verified</span>
                            </label>

                            <label className="check">
                                <input
                                    type="checkbox"
                                    checked={statusFilter.verified}
                                    onChange={() => toggleStatus("verified")}
                                />
                                {colorMode !== "users" ? (
                                    <span className="dot" style={{ background: statusColor("verified") }} />
                                ) : null}
                                <span>verified</span>
                            </label>

                            <label className="check">
                                <input
                                    type="checkbox"
                                    checked={statusFilter.failed}
                                    onChange={() => toggleStatus("failed")}
                                />
                                {colorMode !== "users" ? (
                                    <span className="dot" style={{ background: statusColor("failed") }} />
                                ) : null}
                                <span>failed</span>
                            </label>

                            <label className="check">
                                <input
                                    type="checkbox"
                                    checked={showParetoOnly}
                                    onChange={(e) => onShowParetoOnlyChange(e.target.checked)}
                                />
                                <span className="paretoOnlyText">{PARETO_FRONT_ONLY_LABEL}</span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

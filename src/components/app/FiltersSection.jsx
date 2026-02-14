import { commandColor, statusColor } from "../../utils/pointUtils.js";

export function FiltersSection({
    benchmarkMenuRef,
    benchmarkMenuOpen,
    benchmarkLabel,
    onBenchmarkMenuToggle,
    onSelectBenchmark,
    availableBenchmarks,
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
                    <span>1) Benchmark</span>
                    <div className="benchmarkDropdown" ref={benchmarkMenuRef}>
                        <button
                            className="benchmarkTrigger"
                            type="button"
                            onClick={onBenchmarkMenuToggle}
                            aria-expanded={benchmarkMenuOpen ? "true" : "false"}
                        >
                            <span>{benchmarkLabel}</span>
                            <span className="benchmarkCaret">{benchmarkMenuOpen ? "▲" : "▼"}</span>
                        </button>

                        {benchmarkMenuOpen ? (
                            <div className="benchmarkMenu" role="listbox">
                                <button className="benchmarkOption" type="button" onClick={() => onSelectBenchmark("test")}>
                                    test
                                </button>
                                {availableBenchmarks.map((b) => (
                                    <button
                                        key={b}
                                        className="benchmarkOption"
                                        type="button"
                                        onClick={() => onSelectBenchmark(String(b))}
                                    >
                                        {b}
                                    </button>
                                ))}
                            </div>
                        ) : null}
                    </div>
                </label>

                <label className="field">
                    <span>2) Color by</span>
                    <select value={colorMode} onChange={(e) => onColorModeChange(e.target.value)}>
                        <option value="status">Status</option>
                        <option value="users">Users</option>
                    </select>
                </label>

                <div className="field">
                    <span>3) Show statuses</span>

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
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

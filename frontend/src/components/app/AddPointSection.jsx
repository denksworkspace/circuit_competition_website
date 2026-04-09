// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { MAX_DESCRIPTION_LEN, MAX_INPUT_FILENAME_LEN } from "../../constants/appConstants.js";

function getTerminalStatusLabel(requestStatusRaw) {
    const requestStatus = String(requestStatusRaw || "").trim().toLowerCase();
    if (requestStatus === "completed") return "finished";
    if (requestStatus === "failed") return "failed";
    if (requestStatus === "interrupted") return "stopped";
    if (requestStatus === "closed") return "closed";
    return "";
}

function getTerminalStatusClass(requestStatusRaw) {
    const requestStatus = String(requestStatusRaw || "").trim().toLowerCase();
    if (requestStatus === "completed") return "uploadFinishedText";
    if (requestStatus === "failed") return "uploadFailedText";
    if (requestStatus === "interrupted" || requestStatus === "closed") return "uploadStoppedText";
    return "";
}

function getLiveProcessedStatusLabel(uploadProgress) {
    const terminalLabel = getTerminalStatusLabel(uploadProgress?.requestStatus);
    if (terminalLabel) return terminalLabel;
    const phase = String(uploadProgress?.phase || "").trim().toLowerCase();
    if (!phase) return "";
    if (phase === "finished") return "finished";
    if (phase === "saving") return "adding to database and saving points";
    if (phase === "waiting-manual") return "waiting for manual verdict";
    if (phase === "processing" || phase === "parser" || phase === "checker" || phase === "working") {
        return "working with circuits";
    }
    if (phase === "uploading" || phase === "preparing") return "saving to queue";
    return "";
}

export function AddPointSection({
    formatGb,
    maxSingleUploadBytes,
    remainingUploadBytes,
    totalUploadQuotaBytes,
    maxMultiFileBatchCount,
    addPointFromFile,
    fileInputRef,
    benchFiles,
    canAdd,
    onFileChange,
    descriptionDraft,
    onDescriptionDraftChange,
    uploadError,
    uploadVerdictNote,
    isUploading,
    isUploadStopping,
    uploadProgress,
    uploadLiveRows,
    showUploadMonitor,
    uploadLogText,
    onDownloadUploadLog,
    onStopUpload,
    selectedChecker,
    onSelectedCheckerChange,
    canUseFastHex,
    selectedParser,
    onSelectedParserChange,
    checkerTleSecondsDraft,
    onCheckerTleSecondsDraftChange,
    checkerTleMaxSeconds,
    parserTleSecondsDraft,
    onParserTleSecondsDraftChange,
    parserTleMaxSeconds,
    manualSynthesis,
    onManualSynthesisChange,
    autoManualWindow,
    onAutoManualWindowChange,
    isUploadSettingsOpen,
    onToggleUploadSettings,
    showManualApplyButton,
    onOpenManualApply,
    uploadDisabledReason,
}) {
    const requestStatus = String(uploadProgress?.requestStatus || "").trim().toLowerCase();
    const terminalStatusLabel = getTerminalStatusLabel(requestStatus);
    const terminalStatusClass = getTerminalStatusClass(requestStatus);
    const liveProcessedStatus = getLiveProcessedStatusLabel(uploadProgress);
    const isFinishedPhase = String(uploadProgress?.phase || "").trim().toLowerCase() === "finished";
    const bodyStatusLabel = terminalStatusLabel || (isFinishedPhase ? "finished" : "");
    const bodyStatusClass = terminalStatusClass || (isFinishedPhase ? "uploadFinishedText" : "");
    const headerStatusClass = terminalStatusClass || (isFinishedPhase ? "uploadFinishedText" : "");
    const isUploadBusy = isUploading && !terminalStatusLabel && !isFinishedPhase;

    return (
        <section className="card">
            <div className="cardHeader tight addPointHeader">
                <div>
                    <div className="cardTitleRow">
                        <div className="cardTitle">Add a point</div>
                        <div className="helpTipWrap" tabIndex={0} aria-label="Add point format help">
                            <span className="helpTipIcon">?</span>
                            <div className="helpTipPanel">
                                <div className="cardHint"><b>Expected file name pattern:</b></div>
                                <div className="cardHint mono">
                                    bench{"{BENCH}"}_{"{DELAY}"}_{"{AREA}"}.bench or ex{"{BENCH}"}_{"{DELAY}"}_{"{AREA}"}.bench
                                </div>
                                <div className="cardHint">
                                    Where:
                                    <ul className="hintList">
                                        <li>
                                            <span className="mono">{"{BENCH}"}</span> is an integer from <b>200</b> to <b>299</b>
                                        </li>
                                        <li>
                                            <span className="mono">{"{DELAY}"}</span> and <span className="mono">{"{AREA}"}</span> are integers (0..10^9)
                                        </li>
                                        <li>
                                            <span className="mono">description</span> is optional (up to <b>{MAX_DESCRIPTION_LEN}</b> chars), default is <b>circuit</b>
                                        </li>
                                        <li>input file name length ≤ {MAX_INPUT_FILENAME_LEN}</li>
                                    </ul>
                                </div>
                                <div className="cardHint">Example input: <span className="mono">bench254_15_40.bench</span></div>
                                <div className="cardHint">
                                    Stored file name is generated automatically:
                                    <span className="mono"> bench{"{BENCH}"}_{"{DELAY}"}_{"{AREA}"}_{"{COMMAND}"}_{"{POINT_ID}"}.bench</span>
                                </div>
                                <div className="cardHint">
                                    The latest added point is shown as a <b>diamond</b> on the chart.
                                </div>
                                <div className="cardHint">
                                    File is uploaded to S3. Per-file limit: {formatGb(maxSingleUploadBytes)} GB.
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="cardHint">
                        You can upload {formatGb(remainingUploadBytes)}/{formatGb(totalUploadQuotaBytes)} GB
                        for multi-file uploads.
                    </div>
                    <div className="cardHint">
                        If you upload only one file, it does not consume multi-file quota.
                    </div>
                    <div className="cardHint">
                        Multi-file upload limit: {maxMultiFileBatchCount} files per batch.
                    </div>
                </div>
                <button
                    type="button"
                    className="settingsGear"
                    onClick={onToggleUploadSettings}
                    aria-label="Open upload settings"
                    title="Upload settings"
                >
                    <svg className="settingsGearSvg" viewBox="0 0 16 16" aria-hidden="true">
                        <path fillRule="evenodd" clipRule="evenodd" d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.902 3.433 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.892 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.892-1.64-.902-3.434-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319ZM8 10.93a2.93 2.93 0 1 0 0-5.86 2.93 2.93 0 0 0 0 5.86Z" />
                    </svg>
                </button>
            </div>

            <form className="form" onSubmit={addPointFromFile}>
                <label className="field">
                    <span>file</span>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".bench"
                        multiple
                        onChange={onFileChange}
                        className={benchFiles.length > 0 && !canAdd ? "bad" : ""}
                    />
                </label>

                <label className="field">
                    <span>description (max {MAX_DESCRIPTION_LEN})</span>
                    <input
                        value={descriptionDraft}
                        onChange={(e) => onDescriptionDraftChange(e.target.value)}
                        placeholder="Short description (default: circuit)"
                    />
                </label>

                {isUploadSettingsOpen ? (
                    <div className="settingsPanel">
                        <label className="field">
                            <span>checker</span>
                            <select value={selectedChecker} onChange={(e) => onSelectedCheckerChange(e.target.value)}>
                                <option value="select">Select</option>
                                <option value="none">Do not verify (non-verified)</option>
                                <option value="ABC">ABC</option>
                                {canUseFastHex ? <option value="ABC_FAST_HEX">ABC fast hex</option> : null}
                            </select>
                        </label>

                        <label className="field">
                            <span>parser parameters</span>
                            <select value={selectedParser} onChange={(e) => onSelectedParserChange(e.target.value)}>
                                <option value="select">Select</option>
                                <option value="ABC">ABC</option>
                            </select>
                        </label>

                        <label className="field">
                            <span>checker TLE (seconds, max {checkerTleMaxSeconds})</span>
                            <input
                                value={checkerTleSecondsDraft}
                                onChange={(e) => onCheckerTleSecondsDraftChange(e.target.value)}
                                placeholder="e.g. 10"
                                inputMode="numeric"
                            />
                        </label>

                        <label className="field">
                            <span>parser TLE (seconds, max {parserTleMaxSeconds})</span>
                            <input
                                value={parserTleSecondsDraft}
                                onChange={(e) => onParserTleSecondsDraftChange(e.target.value)}
                                placeholder="e.g. 10"
                                inputMode="numeric"
                            />
                        </label>

                        <label className="check compactCheck">
                            <input
                                type="checkbox"
                                checked={manualSynthesis}
                                onChange={(e) => onManualSynthesisChange(Boolean(e.target.checked))}
                            />
                            <span className="paretoOnlyText">manual synthesis</span>
                        </label>

                        <label className="check compactCheck">
                            <input
                                type="checkbox"
                                checked={autoManualWindow}
                                onChange={(e) => onAutoManualWindowChange(Boolean(e.target.checked))}
                            />
                            <span className="paretoOnlyText">auto manual window</span>
                        </label>

                    </div>
                ) : null}

                {uploadError.trim() ? <div className="error">{uploadError}</div> : null}
                {uploadVerdictNote.trim() ? <div className="cardHint">{uploadVerdictNote}</div> : null}

                <span
                    className={!canAdd ? "disabledHintWrap" : ""}
                    title={!canAdd ? uploadDisabledReason : ""}
                    aria-label={!canAdd ? uploadDisabledReason : ""}
                    data-testid="upload-submit-wrap"
                >
                    <button className="btn primary" type="submit" disabled={!canAdd}>
                        {isUploadBusy ? "Uploading..." : "Upload & create point"}
                    </button>
                </span>
                {isUploadBusy ? (
                    <button className="btn danger" type="button" onClick={onStopUpload} disabled={isUploadStopping}>
                        {isUploadStopping ? "Stopping..." : "Stop upload"}
                    </button>
                ) : null}

                {showUploadMonitor && uploadProgress ? (
                    <>
                        {uploadProgress.phase !== "uploading" ? (
                            <div className="uploadProgressStats">
                                <div className="cardHint">
                                    Processed {uploadProgress.done} / {uploadProgress.total} files
                                </div>
                                <div className="cardHint">
                                    Verified {Number(uploadProgress.verified || 0)} / {uploadProgress.total}
                                </div>
                            </div>
                        ) : null}
                        {uploadProgress.phase === "preparing" ? (
                            <div className="cardHint">
                                Please wait, starting circuit upload may take up to a minute
                            </div>
                        ) : null}
                        {uploadProgress.phase === "uploading" ? (
                            <div className="cardHint">
                                saving to queue... {Number(uploadProgress.queueUploaded || 0)} / {Number(uploadProgress.queueTotal || uploadProgress.total || 0)}
                            </div>
                        ) : null}
                        {uploadProgress.phase === "waiting-manual" ? (
                            <div className="cardHint">
                                Waiting for manual verdict before the upload can finish.
                            </div>
                        ) : null}
                        {(uploadProgress.phase === "processing" || uploadProgress.phase === "working") ? (
                            <div className="cardHint">
                                Processing {uploadProgress.currentFileName || "current file"}...
                            </div>
                        ) : null}
                        {uploadProgress.phase === "parser" ? (
                            <div className="cardHint">
                                Parsing parameters for {uploadProgress.currentFileName || "current file"}...
                            </div>
                        ) : null}
                        {uploadProgress.phase === "checker" ? (
                            <div className="cardHint">
                                Running checker for {uploadProgress.currentFileName || "current file"}...
                            </div>
                        ) : null}
                        {uploadProgress.phase === "saving" ? (
                            <div className="cardHint">
                                adding to database and saving points...
                            </div>
                        ) : null}
                        {(uploadProgress.phase === "parser" || uploadProgress.phase === "checker") &&
                        Number.isFinite(uploadProgress.secondsRemaining) ? (
                            <div className="cardHint">
                                {uploadProgress.secondsRemaining > 0
                                    ? `Time left: ${uploadProgress.secondsRemaining}`
                                    : uploadProgress.transitionTarget === "next-step"
                                        ? "Switching to the next step..."
                                        : "Switching to the next circuit..."}
                            </div>
                        ) : null}
                        {bodyStatusLabel ? (
                            <div className={bodyStatusClass ? `cardHint ${bodyStatusClass}` : "cardHint"}>
                                {bodyStatusLabel}
                            </div>
                        ) : null}
                        {Number(uploadProgress.total || 0) > 0
                            && Number(uploadProgress.done || 0) >= Number(uploadProgress.total || 0) ? (
                                <div className="cardHint">
                                    <b>Pareto front: {Number(uploadProgress.paretoFront || 0)}</b>
                                </div>
                            ) : null}
                    </>
                ) : null}

                {showUploadMonitor && uploadLiveRows.length > 0 ? (
                    <div className="uploadLivePanel" role="status" aria-live="polite">
                        <div className="uploadLiveHeader">
                            <div className="pointModalTitle">Live processed</div>
                            <div className="uploadLiveHeaderMeta">
                                {liveProcessedStatus ? (
                                    <div className={headerStatusClass ? `cardHint ${headerStatusClass}` : "cardHint"}>
                                        status: <b>{liveProcessedStatus}</b>
                                    </div>
                                ) : null}
                                <div className="cardHint">{uploadLiveRows.length} files in current upload</div>
                            </div>
                        </div>
                            <div className="uploadLiveList">
                                {uploadLiveRows.map((row) => (
                                    <div key={row.key} className="uploadLiveItem">
                                        <span className={`uploadLiveStatus ${row.tone || "muted"}`}>{row.statusLabel}</span>
                                        <div className="uploadLiveMeta">
                                            {row.paretoLabel ? (
                                                <div className={`uploadLiveStatus ${row.paretoTone || "info"}`}>{row.paretoLabel}</div>
                                            ) : null}
                                            <div className="uploadLiveFile">{row.fileName}</div>
                                            {row.reason ? <div className="cardHint">{row.reason}</div> : null}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}

                {showManualApplyButton ? (
                    <button className="btn primary" type="button" onClick={onOpenManualApply}>
                        Apply manual verdict
                    </button>
                ) : null}
                {uploadLogText ? (
                    <button className="btn ghost" type="button" onClick={onDownloadUploadLog}>
                        Download upload log
                    </button>
                ) : null}
            </form>
        </section>
    );
}

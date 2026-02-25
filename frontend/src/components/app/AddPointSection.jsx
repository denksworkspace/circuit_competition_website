// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { MAX_DESCRIPTION_LEN, MAX_INPUT_FILENAME_LEN } from "../../constants/appConstants.js";

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
    isUploading,
    uploadProgress,
    uploadLogText,
    onDownloadUploadLog,
    selectedChecker,
    onSelectedCheckerChange,
    selectedParser,
    onSelectedParserChange,
    checkerTleSecondsDraft,
    onCheckerTleSecondsDraftChange,
    checkerTleMaxSeconds,
    parserTleSecondsDraft,
    onParserTleSecondsDraftChange,
    parserTleMaxSeconds,
    isUploadSettingsOpen,
    onToggleUploadSettings,
    uploadDisabledReason,
}) {
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
                                    bench{"{BENCH}"}_{"{DELAY}"}_{"{AREA}"} or bench{"{BENCH}"}_{"{DELAY}"}_{"{AREA}"}.bench
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
                                            <span className="mono">description</span> is optional (up to <b>{MAX_DESCRIPTION_LEN}</b> chars), default is <b>schema</b>
                                        </li>
                                        <li>input file name length ≤ {MAX_INPUT_FILENAME_LEN}</li>
                                    </ul>
                                </div>
                                <div className="cardHint">Example input: <span className="mono">bench254_15_40</span></div>
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
                        placeholder="Short description (default: schema)"
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
                            </select>
                        </label>

                        <label className="field">
                            <span>parser parameters</span>
                            <select value={selectedParser} onChange={(e) => onSelectedParserChange(e.target.value)}>
                                <option value="select">Select</option>
                                <option value="none">Do not parse (non-verified)</option>
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

                    </div>
                ) : null}

                {uploadError.trim() ? <div className="error">{uploadError}</div> : null}

                <span className={!canAdd ? "disabledHintWrap" : ""} title={!canAdd ? uploadDisabledReason : ""}>
                    <button className="btn primary" type="submit" disabled={!canAdd}>
                        {isUploading ? "Uploading..." : "Upload & create point"}
                    </button>
                </span>

                {isUploading && uploadProgress ? (
                    <>
                        <div className="uploadProgressStats">
                            <div className="cardHint">
                                Processed {uploadProgress.done} / {uploadProgress.total} files
                            </div>
                            <div className="cardHint">
                                Verified {Number(uploadProgress.verified || 0)} / {uploadProgress.total}
                            </div>
                        </div>
                        {uploadProgress.phase === "preparing" ? (
                            <div className="cardHint">
                                Please wait, starting circuit upload may take up to a minute
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
                                Saving files and points...
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
                    </>
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

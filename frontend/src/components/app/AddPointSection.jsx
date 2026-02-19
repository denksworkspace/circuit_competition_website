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
    useParamParser,
    onUseParamParserChange,
}) {
    return (
        <section className="card">
            <div className="cardHeader tight">
                <div>
                    <div className="cardTitle">Add a point</div>

                    <div className="cardHint">
                        <b>Expected file name pattern</b>:
                    </div>

                    <div className="cardHint">
                        <span className="mono">
                            bench{"{BENCH}"}_{"{DELAY}"}_{"{AREA}"} or bench{"{BENCH}"}_{"{DELAY}"}_{"{AREA}"}.bench
                        </span>
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
                            <li>input file name length {"<="} {MAX_INPUT_FILENAME_LEN}</li>
                        </ul>
                    </div>

                    <div className="cardHint">
                        Example input: <span className="mono">bench254_15_40</span>
                    </div>

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

                <label className="field">
                    <span>checker</span>
                    <select value={selectedChecker} onChange={(e) => onSelectedCheckerChange(e.target.value)}>
                        <option value="none">Do not verify (non-verified)</option>
                        <option value="ABC">ABC</option>
                    </select>
                </label>

                <label className="manualApplyItem">
                    <input
                        type="checkbox"
                        checked={useParamParser}
                        onChange={(e) => onUseParamParserChange(e.target.checked)}
                    />
                    <span>Use parser parameters (Render ABC metrics check)</span>
                </label>

                {uploadError.trim() ? <div className="error">{uploadError}</div> : null}

                <button className="btn primary" type="submit" disabled={!canAdd}>
                    {isUploading ? "Uploading..." : "Upload & create point"}
                </button>

                {isUploading && uploadProgress && uploadProgress.total > 1 ? (
                    <div className="cardHint">
                        Processed {uploadProgress.done} / {uploadProgress.total} files
                    </div>
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

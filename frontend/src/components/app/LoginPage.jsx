// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
export function LoginPage({
    isBootstrapping,
    isAuthChecking,
    authKeyDraft,
    authError,
    onAuthKeyDraftChange,
    onLogin,
}) {
    return (
        <div className="loginPage">
            <div className="loginCard card">
                <div className="cardHeader">
                    <div>
                        <div className="cardTitle">Access key required</div>
                        <div className="cardHint">
                            {isBootstrapping ? "Checking saved key..." : "Enter your team key to open the site."}
                        </div>
                    </div>
                </div>

                <form className="form" onSubmit={onLogin}>
                    <label className="field">
                        <span>Key</span>
                        <input
                            value={authKeyDraft}
                            onChange={(e) => onAuthKeyDraftChange(e.target.value)}
                            placeholder="key_XXXXXXXXXXXXXXXX"
                            autoFocus
                            disabled={isBootstrapping || isAuthChecking}
                        />
                    </label>

                    {authError ? <div className="error">{authError}</div> : null}

                    <button className="btn primary" type="submit" disabled={isBootstrapping || isAuthChecking}>
                        {isAuthChecking ? "Checking..." : "Enter"}
                    </button>
                </form>
            </div>
        </div>
    );
}

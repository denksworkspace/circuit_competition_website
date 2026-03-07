// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { AdminSettingsPanel } from "./admin/AdminSettingsPanel.jsx";
import { AdminLogsPanel } from "./admin/AdminLogsPanel.jsx";
import { AdminModals } from "./admin/AdminModals.jsx";

export function AdminSettingsSection(props) {
    const {
        isAdminQuotaSettingsOpen,
        onToggleAdminQuotaSettings,
    } = props;

    return (
        <section className="card">
            <div className="cardHeader tight">
                <div>
                    <div className="cardTitle">Admin logs</div>
                    <div className="cardHint">Settings are available via the gear icon.</div>
                </div>
                <button
                    type="button"
                    className="settingsGear"
                    onClick={onToggleAdminQuotaSettings}
                    aria-label="Open quota settings"
                    title="Quota settings"
                >
                    <svg className="settingsGearSvg" viewBox="0 0 16 16" aria-hidden="true">
                        <path fillRule="evenodd" clipRule="evenodd" d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.902 3.433 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.892 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.892-1.64-.902-3.434-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319ZM8 10.93a2.93 2.93 0 1 0 0-5.86 2.93 2.93 0 0 0 0 5.86Z" />
                    </svg>
                </button>
            </div>

            <div className="form">
                {isAdminQuotaSettingsOpen ? <AdminSettingsPanel {...props} /> : null}
                <AdminLogsPanel {...props} />
            </div>

            <AdminModals {...props} />
        </section>
    );
}

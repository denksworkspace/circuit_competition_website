// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { rejectMethod } from "./_lib/http.js";
import { canBypassMaintenance, getMaintenanceState } from "./_lib/maintenanceMode.js";

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["GET"])) return;

    const state = await getMaintenanceState();
    const authKey = String(req.query?.authKey || "").trim();
    const bypass = authKey
        ? await canBypassMaintenance({ query: { authKey }, body: {} }, state.whitelistAdminIds)
        : false;

    res.status(200).json({
        maintenance: {
            enabled: state.enabled,
            activeForUser: state.enabled && !bypass,
            bypass,
            message: state.message,
        },
    });
}

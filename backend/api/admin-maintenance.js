// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { parseBody, rejectMethod } from "./_lib/http.js";
import { authenticateAdmin } from "./_lib/adminUsers/utils.js";
import { getMaintenanceState, parseWhitelistAdminIds, setMaintenanceState } from "./_lib/maintenanceMode.js";

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["GET", "PATCH"])) return;

    const authKey = String(req.query?.authKey || req.body?.authKey || "").trim();
    const admin = await authenticateAdmin(authKey);
    if (!admin) {
        res.status(403).json({ error: "Admin access required." });
        return;
    }

    if (req.method === "GET") {
        const maintenance = await getMaintenanceState();
        res.status(200).json({ maintenance });
        return;
    }

    const body = parseBody(req);
    const enabled = Boolean(body?.enabled);
    const message = String(body?.message || "").trim();
    const whitelistAdminIds = parseWhitelistAdminIds(body?.whitelistAdminIds);
    const maintenance = await setMaintenanceState({
        enabled,
        message,
        whitelistAdminIds,
    });

    res.status(200).json({ maintenance });
}

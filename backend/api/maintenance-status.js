// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { rejectMethod } from "./_lib/http.js";
import { resolveMaintenanceStatus } from "./_lib/maintenanceMode.js";

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["GET"])) return;

    const authKey = String(req.query?.authKey || "").trim();
    const resolved = await resolveMaintenanceStatus({
        ...req,
        query: authKey ? { ...req.query, authKey } : (req.query || {}),
        body: req.body || {},
    });

    res.status(200).json({
        maintenance: {
            enabled: Boolean(resolved?.enabled),
            activeForUser: Boolean(resolved?.activeForUser),
            bypass: Boolean(resolved?.bypass),
            message: String(resolved?.message || ""),
            reason: String(resolved?.reason || "none"),
            compatibility: resolved?.compatibility || null,
        },
    });
}

// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { ensureCommandRolesSchema } from "./_roles.js";
import { rejectMethod } from "./_lib/http.js";
import { authenticateAdmin } from "./_lib/adminUsers/utils.js";
import { getActionLogs } from "./_lib/actionLogs.js";

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["GET"])) return;

    await ensureCommandRolesSchema();

    const authKey = String(req.query?.authKey || "").trim();
    const limit = Number(req.query?.limit);
    const admin = await authenticateAdmin(authKey);
    if (!admin) {
        res.status(403).json({ error: "Admin access required." });
        return;
    }

    const actionLogs = await getActionLogs(limit);
    res.status(200).json({ actionLogs });
}

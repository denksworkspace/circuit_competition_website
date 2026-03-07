// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { rejectMethod, parseBody } from "./_lib/http.js";
import { addSiteActivityLogs } from "./_lib/siteActivityLogs.js";

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["POST"])) return;

    try {
        const body = parseBody(req);
        const events = Array.isArray(body?.events) ? body.events : body;
        const inserted = await addSiteActivityLogs(events);
        res.status(200).json({ ok: true, inserted });
    } catch {
        res.status(500).json({ error: "Failed to persist site activity logs." });
    }
}

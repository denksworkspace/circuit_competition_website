// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";
import { rejectMethod } from "./_lib/http.js";
import { ensureCommandUploadSettingsSchema } from "./_lib/commandUploadSettings.js";

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["GET"])) return;

    const authKey = String(req?.query?.authKey || "").trim();
    if (!authKey) {
        res.status(401).json({ error: "Missing auth key." });
        return;
    }

    await ensureCommandUploadSettingsSchema();

    const authRes = await sql`
      select id, last_pareto_export_at, has_new_pareto
      from commands
      where auth_key = ${authKey}
      limit 1
    `;
    if (authRes.rows.length === 0) {
        res.status(401).json({ error: "Invalid auth key." });
        return;
    }
    const actor = authRes.rows[0];

    res.status(200).json({
        hasNewPareto: Boolean(actor?.has_new_pareto),
        lastParetoExportAt: actor?.last_pareto_export_at || null,
    });
}

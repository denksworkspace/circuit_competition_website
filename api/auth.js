// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";
import { ensureCommandRolesSchema, normalizeRole } from "./_roles.js";
import { parseBody, rejectMethod } from "./_lib/http.js";
import {
    ensureCommandUploadSettingsSchema,
    normalizeCommandUploadSettings,
} from "./_lib/commandUploadSettings.js";

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["POST"])) return;

    const body = parseBody(req);
    const authKey = String(body?.authKey || "").trim();
    if (!authKey) {
        res.status(400).json({ error: "Missing auth key." });
        return;
    }

    await ensureCommandRolesSchema();
    await ensureCommandUploadSettingsSchema();

    const result = await sql`
      select id, name, color, role, max_single_upload_bytes, total_upload_quota_bytes, uploaded_bytes_total, max_multi_file_batch_count
      from commands
      where auth_key = ${authKey}
      limit 1
    `;

    if (result.rows.length === 0) {
        res.status(401).json({ error: "Invalid auth key." });
        return;
    }

    const row = result.rows[0];
    const uploadSettings = normalizeCommandUploadSettings(row);
    res.status(200).json({
        command: {
            id: Number(row.id),
            name: row.name,
            color: row.color,
            role: normalizeRole(row.role),
            ...uploadSettings,
        },
    });
}

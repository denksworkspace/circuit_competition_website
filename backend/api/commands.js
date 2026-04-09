// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";
import { ensureCommandRolesSchema, normalizeRole } from "./_roles.js";
import { rejectMethod } from "./_lib/http.js";

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["GET"])) return;

    const authKey = String(req?.query?.authKey || "").trim();
    if (!authKey) {
        res.status(401).json({ error: "Missing auth key." });
        return;
    }

    const authRes = await sql`
      select id
      from public.commands
      where auth_key = ${authKey}
      limit 1
    `;
    if (authRes.rows.length === 0) {
        res.status(401).json({ error: "Invalid auth key." });
        return;
    }

    await ensureCommandRolesSchema();

    const result = await sql`
      select id, name, color, role
      from public.commands
      order by name asc
    `;

    const commands = result.rows.map((row) => ({
        id: Number(row.id),
        name: row.name,
        color: row.color,
        role: normalizeRole(row.role),
    }));

    res.status(200).json({ commands });
}

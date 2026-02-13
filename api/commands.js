import { sql } from "@vercel/postgres";
import { ensureCommandRolesSchema, normalizeRole } from "./_roles.js";
import { rejectMethod } from "./_lib/http.js";

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["GET"])) return;

    await ensureCommandRolesSchema();

    const result = await sql`
      select id, name, color, role
      from commands
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

import { sql } from "@vercel/postgres";
import { ensureCommandRolesSchema, normalizeRole } from "./_roles.js";

function parseBody(req) {
    if (req.body && typeof req.body === "object") return req.body;
    if (!req.body) return {};
    try {
        return JSON.parse(req.body);
    } catch {
        return {};
    }
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        res.status(405).end();
        return;
    }

    const body = parseBody(req);
    const authKey = String(body?.authKey || "").trim();
    if (!authKey) {
        res.status(400).json({ error: "Missing auth key." });
        return;
    }

    await ensureCommandRolesSchema();

    const result = await sql`
      select id, name, color, role
      from commands
      where auth_key = ${authKey}
      limit 1
    `;

    if (result.rows.length === 0) {
        res.status(401).json({ error: "Invalid auth key." });
        return;
    }

    const row = result.rows[0];
    res.status(200).json({
        command: {
            id: Number(row.id),
            name: row.name,
            color: row.color,
            role: normalizeRole(row.role),
        },
    });
}

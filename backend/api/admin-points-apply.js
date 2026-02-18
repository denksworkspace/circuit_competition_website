// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";
import { ensureCommandRolesSchema, ROLE_ADMIN } from "./_roles.js";
import { parseBody, rejectMethod } from "./_lib/http.js";
import { CHECKER_ABC, normalizeCheckerVersion } from "./_lib/pointVerification.js";

const ALLOWED_STATUS = new Set(["verified", "failed", "non-verified"]);

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["POST"])) return;

    const body = parseBody(req);
    const authKey = String(body?.authKey || "").trim();
    const updates = Array.isArray(body?.updates) ? body.updates : [];
    const checkerVersion = normalizeCheckerVersion(body?.checkerVersion || CHECKER_ABC);

    if (!authKey) {
        res.status(401).json({ error: "Missing auth key." });
        return;
    }
    if (checkerVersion !== CHECKER_ABC) {
        res.status(400).json({ error: "Unsupported checker." });
        return;
    }

    await ensureCommandRolesSchema();
    const authRes = await sql`
      select id, role
      from commands
      where auth_key = ${authKey}
      limit 1
    `;
    if (authRes.rows.length === 0) {
        res.status(401).json({ error: "Invalid auth key." });
        return;
    }
    if (String(authRes.rows[0].role || "").toLowerCase() !== ROLE_ADMIN) {
        res.status(403).json({ error: "Only admin can apply statuses." });
        return;
    }

    let applied = 0;
    const invalid = [];

    for (const update of updates) {
        const pointId = String(update?.pointId || "").trim();
        const status = String(update?.status || "").trim();
        if (!pointId || !ALLOWED_STATUS.has(status)) {
            invalid.push({ pointId, status, reason: "Invalid update item." });
            continue;
        }
        const checker = status === "non-verified" ? null : checkerVersion;
        await sql`
          update points
          set status = ${status},
              checker_version = ${checker}
          where id = ${pointId}
        `;
        applied += 1;
    }

    res.status(200).json({
        ok: true,
        applied,
        invalid,
    });
}

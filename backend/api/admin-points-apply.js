// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";
import { ensureCommandRolesSchema, ROLE_ADMIN } from "./_roles.js";
import { parseBody, rejectMethod } from "./_lib/http.js";
import { CHECKER_ABC, CHECKER_ABC_FAST_HEX, normalizeCheckerVersion } from "./_lib/pointVerification.js";
import { ensurePointsStatusConstraint } from "./_lib/pointsStatus.js";
import { syncParetoFilenameCsvs } from "./_lib/paretoFilenameSync.js";

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
    if (checkerVersion !== CHECKER_ABC && checkerVersion !== CHECKER_ABC_FAST_HEX) {
        res.status(400).json({ error: "Unsupported checker." });
        return;
    }

    await ensureCommandRolesSchema();
    await ensurePointsStatusConstraint();
    const authRes = await sql`
      select id, role
      from public.commands
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
    const affectedStatuses = new Set();

    for (const update of updates) {
        const pointId = String(update?.pointId || "").trim();
        const status = String(update?.status || "").trim();
        if (!pointId || !ALLOWED_STATUS.has(status)) {
            invalid.push({ pointId, status, reason: "Invalid update item." });
            continue;
        }
        const oldStatusRes = await sql`
          select status
          from public.points
          where id = ${pointId}
            and lower(coalesce(lifecycle_status, 'main')) <> 'deleted'
          limit 1
        `;
        const oldStatus = String(oldStatusRes.rows[0]?.status || "").trim().toLowerCase();
        const checker = status === "non-verified" ? null : checkerVersion;
        await sql`
          update public.points
          set status = ${status},
              checker_version = ${checker}
          where id = ${pointId}
            and lower(coalesce(lifecycle_status, 'main')) <> 'deleted'
        `;
        applied += 1;
        affectedStatuses.add(oldStatus);
        affectedStatuses.add(String(status || "").trim().toLowerCase());
    }

    try {
        await syncParetoFilenameCsvs({ statuses: Array.from(affectedStatuses) });
    } catch {
        res.status(500).json({
            error: "Point statuses were updated, but pareto filename CSV sync failed.",
            applied,
            invalid,
        });
        return;
    }

    res.status(200).json({
        ok: true,
        applied,
        invalid,
    });
}

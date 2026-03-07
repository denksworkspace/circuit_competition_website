// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";
import { parseBody } from "../http.js";
import { addActionLog } from "../actionLogs.js";
import { ensurePointsStatusConstraint } from "../pointsStatus.js";

export async function handleDeletePoint(req, res) {
    await ensurePointsStatusConstraint();
    const body = parseBody(req);
    const { id, authKey } = body || {};

    if (!authKey) {
        res.status(401).json({ error: "Missing auth key." });
        return;
    }

    const cmdRes = await sql`select id from commands where auth_key = ${authKey}`;
    if (cmdRes.rows.length === 0) {
        res.status(401).json({ error: "Invalid auth key." });
        return;
    }

    const commandId = cmdRes.rows[0].id;
    const pointRes = await sql`
      select id, command_id, lifecycle_status, benchmark, delay, area, file_name
      from points
      where id = ${id}
      limit 1
    `;
    if (pointRes.rows.length === 0) {
        res.status(404).json({ error: "Point not found." });
        return;
    }
    if (String(pointRes.rows[0].lifecycle_status || "").toLowerCase() === "deleted") {
        res.status(200).json({ ok: true });
        return;
    }

    if (Number(pointRes.rows[0].command_id) !== Number(commandId)) {
        res.status(403).json({ error: "Cannot delete other command points." });
        return;
    }

    await sql`
      update points
      set lifecycle_status = 'deleted',
          checker_version = null
      where id = ${id}
    `;
    await addActionLog({
        commandId,
        actorCommandId: commandId,
        action: "point_soft_deleted",
        details: {
            pointId: id,
            bench: String(pointRes.rows[0].benchmark || ""),
            benchmark: String(pointRes.rows[0].benchmark || ""),
            delay: Number(pointRes.rows[0].delay),
            area: Number(pointRes.rows[0].area),
            fileName: String(pointRes.rows[0].file_name || ""),
            note: "Quota is not refunded for deleted points.",
        },
    });
    res.status(200).json({ ok: true });
}

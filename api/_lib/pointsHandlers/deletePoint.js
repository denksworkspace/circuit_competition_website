import { sql } from "@vercel/postgres";
import { parseBody } from "../http.js";
import { addActionLog } from "../actionLogs.js";

export async function handleDeletePoint(req, res) {
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
    const pointRes = await sql`select id, command_id from points where id = ${id}`;
    if (pointRes.rows.length === 0) {
        res.status(404).json({ error: "Point not found." });
        return;
    }

    if (Number(pointRes.rows[0].command_id) !== Number(commandId)) {
        res.status(403).json({ error: "Cannot delete other command points." });
        return;
    }

    await sql`delete from points where id = ${id}`;
    await addActionLog({
        commandId,
        actorCommandId: commandId,
        action: "point_deleted",
        details: { pointId: id, note: "Quota is not refunded for deleted points." },
    });
    res.status(200).json({ ok: true });
}

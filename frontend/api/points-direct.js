import { sql } from "@vercel/postgres";
import { parseBody, rejectMethod } from "./_lib/http.js";
import { normalizePointRow } from "./_lib/points.js";

function isValidStatus(status) {
    return ["non-verified", "verified", "failed"].includes(status);
}

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["POST"])) return;

    const body = parseBody(req);
    const {
        id,
        benchmark,
        delay,
        area,
        description,
        fileName,
        status,
        authKey,
        checkerVersion,
    } = body || {};

    if (!authKey) {
        res.status(401).json({ error: "Missing auth key." });
        return;
    }

    if (!id || !benchmark || typeof delay !== "number" || typeof area !== "number" || !fileName) {
        res.status(400).json({ error: "Invalid payload." });
        return;
    }

    const normalizedStatus = status || "non-verified";
    if (!isValidStatus(normalizedStatus)) {
        res.status(400).json({ error: "Invalid status." });
        return;
    }

    const cmdRes = await sql`
      select id, name
      from commands
      where auth_key = ${authKey}
      limit 1
    `;
    if (cmdRes.rows.length === 0) {
        res.status(401).json({ error: "Invalid auth key." });
        return;
    }

    const command = cmdRes.rows[0];

    const duplicate = await sql`
      select id
      from points
      where command_id = ${command.id}
        and benchmark = ${String(benchmark)}
        and delay = ${delay}
        and area = ${area}
      limit 1
    `;

    if (duplicate.rows.length > 0) {
        res.status(409).json({
            error: "Point with the same benchmark, delay, and area already exists for this user.",
        });
        return;
    }

    try {
        const insert = await sql`
            insert into points (id, benchmark, delay, area, description, sender, file_name, status, checker_version, command_id)
            values (${id}, ${String(benchmark)}, ${delay}, ${area}, ${String(description || "schema")}, ${command.name}, ${fileName}, ${normalizedStatus}, ${checkerVersion ?? null}, ${command.id})
            returning id, benchmark, delay, area, description, sender, file_name, status, checker_version
        `;

        res.status(201).json({
            point: normalizePointRow(insert.rows[0]),
            quota: null,
        });
    } catch (error) {
        const message = String(error?.message || "").toLowerCase();
        if (message.includes("unique") || message.includes("duplicate")) {
            res.status(409).json({ error: "Point with this file name already exists." });
            return;
        }
        res.status(500).json({ error: "Failed to save point." });
    }
}

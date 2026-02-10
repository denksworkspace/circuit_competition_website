import { sql } from "@vercel/postgres";

function parseBody(req) {
    if (req.body && typeof req.body === "object") return req.body;
    if (!req.body) return {};
    try {
        return JSON.parse(req.body);
    } catch {
        return {};
    }
}

function normalizePoint(row) {
    return {
        id: row.id,
        benchmark: row.benchmark,
        delay: Number(row.delay),
        area: Number(row.area),
        description: row.description,
        sender: row.sender,
        fileName: row.file_name,
        status: row.status,
    };
}

export default async function handler(req, res) {
    if (req.method === "GET") {
        const { rows } = await sql`
      select id, benchmark, delay, area, description, sender, file_name, status
      from points
      order by created_at desc
    `;
        res.status(200).json({ points: rows.map(normalizePoint) });
        return;
    }

    if (req.method === "POST") {
        const body = parseBody(req);
        const {
            id,
            benchmark,
            delay,
            area,
            description,
            sender,
            fileName,
            status,
            authKey,
        } = body || {};

        if (!authKey) {
            res.status(401).json({ error: "Missing auth key." });
            return;
        }

        const cmdRes = await sql`select id, name from commands where auth_key = ${authKey}`;
        if (cmdRes.rows.length === 0) {
            res.status(401).json({ error: "Invalid auth key." });
            return;
        }

        const command = cmdRes.rows[0];
        if (sender !== command.name) {
            res.status(403).json({ error: "Sender must match your command." });
            return;
        }

        if (
            !id ||
            !benchmark ||
            typeof delay !== "number" ||
            typeof area !== "number" ||
            !description ||
            !sender ||
            !fileName
        ) {
            res.status(400).json({ error: "Invalid payload." });
            return;
        }

        const st = status || "non-verified";
        if (!["non-verified", "verified", "failed"].includes(st)) {
            res.status(400).json({ error: "Invalid status." });
            return;
        }

        try {
            const insert = await sql`
        insert into points (id, benchmark, delay, area, description, sender, file_name, status, command_id)
        values (${id}, ${String(benchmark)}, ${delay}, ${area}, ${description}, ${sender}, ${fileName}, ${st}, ${command.id})
        returning id, benchmark, delay, area, description, sender, file_name, status
      `;
            res.status(201).json({ point: normalizePoint(insert.rows[0]) });
            return;
        } catch (e) {
            const msg = String(e?.message || "");
            if (msg.toLowerCase().includes("unique") || msg.toLowerCase().includes("duplicate")) {
                res.status(409).json({ error: "Point with this file name already exists." });
                return;
            }
            res.status(500).json({ error: "Failed to save point." });
            return;
        }
    }

    if (req.method === "DELETE") {
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
        res.status(200).json({ ok: true });
        return;
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    res.status(405).end();
}

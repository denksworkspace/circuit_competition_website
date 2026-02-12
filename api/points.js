/* global process */
import { sql } from "@vercel/postgres";
import { ensureCommandRolesSchema, normalizeRole, ROLE_ADMIN } from "./_roles.js";

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
const MAX_ADMIN_UPLOAD_BYTES = 50 * 1024 * 1024 * 1024;
const MAX_DESCRIPTION_LEN = 200;

function parseBody(req) {
    if (req.body && typeof req.body === "object") return req.body;
    if (!req.body) return {};
    try {
        return JSON.parse(req.body);
    } catch {
        return {};
    }
}

function normalizeCloudFrontDomain(raw) {
    const trimmed = String(raw || "").trim();
    if (!trimmed) return "";
    return trimmed.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

const CLOUDFRONT_DOMAIN = normalizeCloudFrontDomain(process.env.CLOUDFRONT_DOMAIN);

function buildObjectKey(fileName) {
    return `points/${fileName}`;
}

function buildDownloadUrl(fileName) {
    if (!CLOUDFRONT_DOMAIN || !fileName) return null;
    const encodedKey = buildObjectKey(fileName)
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");
    return `https://${CLOUDFRONT_DOMAIN}/${encodedKey}`;
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
        checkerVersion: row.checker_version ?? null,
        fileKey: buildObjectKey(row.file_name),
        downloadUrl: buildDownloadUrl(row.file_name),
    };
}

export default async function handler(req, res) {
    if (req.method === "GET") {
        const { rows } = await sql`
      select id, benchmark, delay, area, description, sender, file_name, status, checker_version
      from points
      order by created_at desc
    `;
        res.status(200).json({ points: rows.map(normalizePoint) });
        return;
    }

    if (req.method === "POST") {
        await ensureCommandRolesSchema();

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
            fileSize,
        } = body || {};

        if (!authKey) {
            res.status(401).json({ error: "Missing auth key." });
            return;
        }

        const cmdRes = await sql`select id, name, role from commands where auth_key = ${authKey}`;
        if (cmdRes.rows.length === 0) {
            res.status(401).json({ error: "Invalid auth key." });
            return;
        }

        const command = cmdRes.rows[0];

        if (
            !id ||
            !benchmark ||
            typeof delay !== "number" ||
            typeof area !== "number" ||
            !fileName
        ) {
            res.status(400).json({ error: "Invalid payload." });
            return;
        }

        const descriptionTrimmed = String(description || "").trim() || "schema";
        if (descriptionTrimmed.length > MAX_DESCRIPTION_LEN) {
            res.status(400).json({ error: `Description is too long. Maximum length is ${MAX_DESCRIPTION_LEN}.` });
            return;
        }

        if (typeof fileSize !== "number" || !Number.isFinite(fileSize) || fileSize < 0) {
            res.status(400).json({ error: "Invalid file size." });
            return;
        }

        const role = normalizeRole(command.role);
        const maxBytes = role === ROLE_ADMIN ? MAX_ADMIN_UPLOAD_BYTES : MAX_UPLOAD_BYTES;

        if (fileSize > maxBytes) {
            if (role === ROLE_ADMIN) {
                res.status(413).json({ error: "File is too large. Maximum size is 50 GB for admin." });
                return;
            }
            res.status(413).json({ error: "File is too large. Maximum size is 500 MB." });
            return;
        }

        const st = status || "non-verified";
        if (!["non-verified", "verified", "failed"].includes(st)) {
            res.status(400).json({ error: "Invalid status." });
            return;
        }

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
        values (${id}, ${String(benchmark)}, ${delay}, ${area}, ${descriptionTrimmed}, ${command.name}, ${fileName}, ${st}, ${checkerVersion ?? null}, ${command.id})
        returning id, benchmark, delay, area, description, sender, file_name, status, checker_version
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

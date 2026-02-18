// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
/* global process */
import { sql } from "@vercel/postgres";
import { ensureCommandRolesSchema, ROLE_ADMIN } from "./_roles.js";
import { parseBody, rejectMethod } from "./_lib/http.js";
import { buildPresignedPutUrl } from "./_lib/s3Presign.js";
import { buildTruthObjectKey, parseTruthFileName } from "./_lib/truthTables.js";

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["POST"])) return;

    const body = parseBody(req);
    const authKey = String(body?.authKey || "").trim();
    const fileName = String(body?.fileName || "").trim();
    const fileSize = Number(body?.fileSize);

    if (!authKey) {
        res.status(401).json({ error: "Missing auth key." });
        return;
    }
    const parsed = parseTruthFileName(fileName);
    if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
    }
    if (!Number.isFinite(fileSize) || fileSize < 0) {
        res.status(400).json({ error: "Invalid file size." });
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
    const actor = authRes.rows[0];
    if (String(actor.role || "").toLowerCase() !== ROLE_ADMIN) {
        res.status(403).json({ error: "Only admin can upload truth tables." });
        return;
    }

    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const region = process.env.AWS_REGION;
    const bucket = process.env.S3_BUCKET;
    const sessionToken = process.env.AWS_SESSION_TOKEN;
    if (!accessKeyId || !secretAccessKey || !region || !bucket) {
        res.status(500).json({ error: "S3 configuration is not complete." });
        return;
    }

    const objectKey = buildTruthObjectKey(parsed.fileName);
    const uploadUrl = buildPresignedPutUrl({
        bucket,
        region,
        accessKeyId,
        secretAccessKey,
        sessionToken,
        objectKey,
        expiresSeconds: 900,
    });

    res.status(200).json({
        uploadUrl,
        fileKey: objectKey,
        method: "PUT",
    });
}

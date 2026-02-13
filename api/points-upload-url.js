/* global process */
import { sql } from "@vercel/postgres";
import { normalizeRole, ensureCommandRolesSchema } from "./_roles.js";
import { parseBody, rejectMethod } from "./_lib/http.js";
import { parseStoredBenchFileName, buildObjectKey } from "./_lib/points.js";
import { buildPresignedPutUrl } from "./_lib/s3Presign.js";
import { maxUploadBytesByRole, uploadSizeErrorByRole } from "./_lib/uploadLimits.js";

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["POST"])) return;

    const body = parseBody(req);
    const { authKey, fileName, fileSize } = body || {};

    if (!authKey) {
        res.status(401).json({ error: "Missing auth key." });
        return;
    }

    const parsed = parseStoredBenchFileName(fileName);
    if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
    }

    if (typeof fileSize !== "number" || !Number.isFinite(fileSize) || fileSize < 0) {
        res.status(400).json({ error: "Invalid file size." });
        return;
    }

    await ensureCommandRolesSchema();
    const cmdRes = await sql`select id, role from commands where auth_key = ${authKey}`;
    if (cmdRes.rows.length === 0) {
        res.status(401).json({ error: "Invalid auth key." });
        return;
    }

    const command = cmdRes.rows[0];
    const role = normalizeRole(command.role);
    const maxBytes = maxUploadBytesByRole(role);

    if (fileSize > maxBytes) {
        res.status(413).json({ error: uploadSizeErrorByRole(role) });
        return;
    }

    const duplicate = await sql`
      select id
      from points
      where command_id = ${command.id}
        and benchmark = ${parsed.benchmark}
        and delay = ${parsed.delay}
        and area = ${parsed.area}
      limit 1
    `;

    if (duplicate.rows.length > 0) {
        res.status(409).json({
            error: "Point with the same benchmark, delay, and area already exists for this user.",
        });
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

    const objectKey = buildObjectKey(parsed.fileName);
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
        maxBytes,
    });
}

// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
/* global process */
import { sql } from "@vercel/postgres";
import { ensureCommandRolesSchema, ROLE_ADMIN } from "./_roles.js";
import { parseBody, rejectMethod } from "./_lib/http.js";
import { buildPresignedPutUrl } from "./_lib/s3Presign.js";
import { buildTruthObjectKey, parseTruthFileName } from "./_lib/truthTables.js";
import {
    DEFAULT_MAX_MULTI_FILE_BATCH_COUNT,
    ensureCommandUploadSettingsSchema,
    normalizeCommandUploadSettings,
} from "./_lib/commandUploadSettings.js";

const MAX_TRUTH_BATCH_FILES = 100;

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["POST"])) return;

    const body = parseBody(req);
    const authKey = String(body?.authKey || "").trim();
    const fileName = String(body?.fileName || "").trim();
    const fileSize = Number(body?.fileSize);
    const normalizedBatchSize = Number(body?.batchSize ?? 1);

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
    if (!Number.isInteger(normalizedBatchSize) || normalizedBatchSize < 1) {
        res.status(400).json({ error: "Invalid batch size." });
        return;
    }
    if (normalizedBatchSize > MAX_TRUTH_BATCH_FILES) {
        res.status(400).json({ error: `Too many files in batch. Maximum is ${MAX_TRUTH_BATCH_FILES}.` });
        return;
    }

    await ensureCommandRolesSchema();
    await ensureCommandUploadSettingsSchema();
    const authRes = await sql`
      select id, role, max_single_upload_bytes, total_upload_quota_bytes, uploaded_bytes_total, max_multi_file_batch_count
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
    const uploadSettings = normalizeCommandUploadSettings(actor);
    const configuredMaxBatch = Math.max(
        1,
        Number(uploadSettings.maxMultiFileBatchCount || DEFAULT_MAX_MULTI_FILE_BATCH_COUNT)
    );
    const maxBatchCount = Math.min(configuredMaxBatch, MAX_TRUTH_BATCH_FILES);
    if (normalizedBatchSize > maxBatchCount) {
        res.status(400).json({ error: `Too many files in batch. Maximum is ${maxBatchCount}.` });
        return;
    }

    if (fileSize > uploadSettings.maxSingleUploadBytes) {
        res.status(413).json({
            error: `File is too large. Maximum size is ${(uploadSettings.maxSingleUploadBytes / (1024 ** 3)).toFixed(2)} GB.`,
        });
        return;
    }

    const chargeBytes = normalizedBatchSize > 1 ? fileSize : 0;
    if (chargeBytes > uploadSettings.remainingUploadBytes) {
        res.status(413).json({
            error: `Multi-file quota exceeded. Remaining: ${(uploadSettings.remainingUploadBytes / (1024 ** 3)).toFixed(2)} GB.`,
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

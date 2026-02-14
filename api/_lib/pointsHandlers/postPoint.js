import { sql } from "@vercel/postgres";
import { ensureCommandRolesSchema } from "../../_roles.js";
import { parseBody } from "../http.js";
import { normalizePointRow } from "../points.js";
import {
    DEFAULT_MAX_MULTI_FILE_BATCH_COUNT,
    ensureCommandUploadSettingsSchema,
    normalizeCommandUploadSettings,
} from "../commandUploadSettings.js";
import { addActionLog } from "../actionLogs.js";

const MAX_DESCRIPTION_LEN = 200;

function isValidStatus(status) {
    return ["non-verified", "verified", "failed"].includes(status);
}

export async function handlePostPoint(req, res) {
    await ensureCommandRolesSchema();
    await ensureCommandUploadSettingsSchema();

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
        batchSize,
    } = body || {};

    if (!authKey) {
        res.status(401).json({ error: "Missing auth key." });
        return;
    }

    const cmdRes = await sql`
      select id, name, role, max_single_upload_bytes, total_upload_quota_bytes, uploaded_bytes_total, max_multi_file_batch_count
      from commands
      where auth_key = ${authKey}
    `;
    if (cmdRes.rows.length === 0) {
        res.status(401).json({ error: "Invalid auth key." });
        return;
    }

    const command = cmdRes.rows[0];

    if (!id || !benchmark || typeof delay !== "number" || typeof area !== "number" || !fileName) {
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

    const normalizedBatchSize = Number(batchSize ?? 1);
    if (!Number.isInteger(normalizedBatchSize) || normalizedBatchSize < 1) {
        res.status(400).json({ error: "Invalid batch size." });
        return;
    }
    const uploadSettings = normalizeCommandUploadSettings(command);
    const maxBatchCount = Math.max(1, Number(uploadSettings.maxMultiFileBatchCount || DEFAULT_MAX_MULTI_FILE_BATCH_COUNT));
    if (normalizedBatchSize > maxBatchCount) {
        res.status(400).json({ error: `Too many files in batch. Maximum is ${maxBatchCount}.` });
        return;
    }
    const isMultiFileBatch = normalizedBatchSize > 1;
    const chargeBytes = isMultiFileBatch ? fileSize : 0;
    const maxBytes = uploadSettings.maxSingleUploadBytes;

    if (fileSize > maxBytes) {
        res.status(413).json({
            error: `File is too large. Maximum size is ${(maxBytes / (1024 ** 3)).toFixed(2)} GB.`,
        });
        return;
    }

    if (chargeBytes > uploadSettings.remainingUploadBytes) {
        res.status(413).json({
            error: `Multi-file quota exceeded. Remaining: ${(uploadSettings.remainingUploadBytes / (1024 ** 3)).toFixed(2)} GB.`,
        });
        return;
    }

    const normalizedStatus = status || "non-verified";
    if (!isValidStatus(normalizedStatus)) {
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

    let quotaRow = null;

    try {
        if (chargeBytes > 0) {
            const quotaUpdate = await sql`
              update commands
              set uploaded_bytes_total = uploaded_bytes_total + ${chargeBytes}::bigint
              where id = ${command.id}
                and uploaded_bytes_total + ${chargeBytes}::bigint <= total_upload_quota_bytes
              returning uploaded_bytes_total, total_upload_quota_bytes, max_single_upload_bytes, role
            `;
            if (quotaUpdate.rows.length === 0) {
                res.status(413).json({
                    error: `Multi-file quota exceeded. Remaining: ${(uploadSettings.remainingUploadBytes / (1024 ** 3)).toFixed(2)} GB.`,
                });
                return;
            }
            quotaRow = quotaUpdate.rows[0];
        }

        const insert = await sql`
            insert into points (id, benchmark, delay, area, description, sender, file_name, status, checker_version, command_id)
            values (${id}, ${String(benchmark)}, ${delay}, ${area}, ${descriptionTrimmed}, ${command.name}, ${fileName}, ${normalizedStatus}, ${checkerVersion ?? null}, ${command.id})
            returning id, benchmark, delay, area, description, sender, file_name, status, checker_version
        `;
        const nextQuota = quotaRow
            ? normalizeCommandUploadSettings(quotaRow)
            : normalizeCommandUploadSettings(command);

        await addActionLog({
            commandId: command.id,
            actorCommandId: command.id,
            action: "point_created",
            details: {
                pointId: id,
                benchmark: String(benchmark),
                delay,
                area,
                fileName,
                fileSize,
                isMultiFileBatch,
                chargedBytes: chargeBytes,
            },
        });

        res.status(201).json({
            point: normalizePointRow(insert.rows[0]),
            quota: nextQuota,
        });
        return;
    } catch (error) {
        if (chargeBytes > 0) {
            await sql`
              update commands
              set uploaded_bytes_total = greatest(0::bigint, uploaded_bytes_total - ${chargeBytes}::bigint)
              where id = ${command.id}
            `;
        }
        const message = String(error?.message || "").toLowerCase();
        if (message.includes("unique") || message.includes("duplicate")) {
            res.status(409).json({ error: "Point with this file name already exists." });
            return;
        }
        res.status(500).json({ error: "Failed to save point." });
        return;
    }
}

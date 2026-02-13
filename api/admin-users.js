import { sql } from "@vercel/postgres";
import { ensureCommandRolesSchema, normalizeRole, ROLE_ADMIN } from "./_roles.js";
import { parseBody, rejectMethod } from "./_lib/http.js";
import {
    DEFAULT_MAX_MULTI_FILE_BATCH_COUNT,
    ensureCommandUploadSettingsSchema,
    normalizeCommandUploadSettings,
} from "./_lib/commandUploadSettings.js";
import { addActionLog, getActionLogsForCommand } from "./_lib/actionLogs.js";

function parsePositiveGb(raw) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return null;
    return Math.floor(value * 1024 * 1024 * 1024);
}

function parsePositiveInt(raw) {
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1) return null;
    return value;
}

function normalizeUserRow(row) {
    return {
        id: Number(row.id),
        name: row.name,
        color: row.color,
        role: normalizeRole(row.role),
        ...normalizeCommandUploadSettings(row),
    };
}

async function authenticateAdmin(authKey) {
    const authKeyTrimmed = String(authKey || "").trim();
    if (!authKeyTrimmed) return null;

    const { rows } = await sql`
      select id, role
      from commands
      where auth_key = ${authKeyTrimmed}
      limit 1
    `;

    if (rows.length === 0) return null;
    const admin = rows[0];
    if (normalizeRole(admin.role) !== ROLE_ADMIN) return null;

    return admin;
}

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["GET", "PATCH"])) return;

    await ensureCommandRolesSchema();
    await ensureCommandUploadSettingsSchema();

    if (req.method === "GET") {
        const authKey = String(req.query?.authKey || "").trim();
        const userId = Number(req.query?.userId);

        const admin = await authenticateAdmin(authKey);
        if (!admin) {
            res.status(403).json({ error: "Admin access required." });
            return;
        }

        if (!Number.isInteger(userId) || userId < 1) {
            res.status(400).json({ error: "Invalid user id." });
            return;
        }

        const userRes = await sql`
          select id, name, color, role, max_single_upload_bytes, total_upload_quota_bytes, uploaded_bytes_total, max_multi_file_batch_count
          from commands
          where id = ${userId}
          limit 1
        `;

        if (userRes.rows.length === 0) {
            res.status(404).json({ error: "User not found." });
            return;
        }

        const user = normalizeUserRow(userRes.rows[0]);
        const actionLogs = await getActionLogsForCommand(user.id, 100);

        res.status(200).json({ user, actionLogs });
        return;
    }

    const body = parseBody(req);
    const {
        authKey,
        userId,
        maxSingleUploadGb,
        totalUploadQuotaGb,
        maxMultiFileBatchCount,
    } = body || {};

    const admin = await authenticateAdmin(authKey);
    if (!admin) {
        res.status(403).json({ error: "Admin access required." });
        return;
    }

    const userIdInt = Number(userId);
    if (!Number.isInteger(userIdInt) || userIdInt < 1) {
        res.status(400).json({ error: "Invalid user id." });
        return;
    }

    const maxSingleBytes = parsePositiveGb(maxSingleUploadGb);
    const totalQuotaBytes = parsePositiveGb(totalUploadQuotaGb);
    const maxBatchCount = parsePositiveInt(maxMultiFileBatchCount);

    if (!maxSingleBytes || !totalQuotaBytes || !maxBatchCount) {
        res.status(400).json({
            error: `Quota values must be positive numbers. Multi-file batch count must be an integer >= 1 (default ${DEFAULT_MAX_MULTI_FILE_BATCH_COUNT}).`,
        });
        return;
    }

    if (maxSingleBytes > totalQuotaBytes) {
        res.status(400).json({ error: "Single-file limit cannot exceed total quota." });
        return;
    }

    const update = await sql`
      update commands
      set
        max_single_upload_bytes = ${maxSingleBytes}::bigint,
        total_upload_quota_bytes = ${totalQuotaBytes}::bigint,
        max_multi_file_batch_count = ${maxBatchCount}
      where id = ${userIdInt}
      returning id, name, color, role, max_single_upload_bytes, total_upload_quota_bytes, uploaded_bytes_total, max_multi_file_batch_count
    `;

    if (update.rows.length === 0) {
        res.status(404).json({ error: "User not found." });
        return;
    }

    await addActionLog({
        commandId: userIdInt,
        actorCommandId: admin.id,
        action: "admin_updated_upload_settings",
        details: {
            maxSingleUploadGb: Number(maxSingleUploadGb),
            totalUploadQuotaGb: Number(totalUploadQuotaGb),
            maxMultiFileBatchCount: Number(maxMultiFileBatchCount),
        },
    });

    const user = normalizeUserRow(update.rows[0]);
    const actionLogs = await getActionLogsForCommand(user.id, 100);
    res.status(200).json({ user, actionLogs });
}

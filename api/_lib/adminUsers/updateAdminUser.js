import { sql } from "@vercel/postgres";
import { DEFAULT_MAX_MULTI_FILE_BATCH_COUNT } from "../commandUploadSettings.js";
import { addActionLog, getActionLogsForCommand } from "../actionLogs.js";
import { authenticateAdmin, normalizeUserRow, parsePositiveGb, parsePositiveInt } from "./utils.js";

export async function handleUpdateAdminUser(req, res, body) {
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

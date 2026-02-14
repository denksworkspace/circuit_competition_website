import { sql } from "@vercel/postgres";
import { getActionLogsForCommand } from "../actionLogs.js";
import { authenticateAdmin, normalizeUserRow } from "./utils.js";

export async function handleGetAdminUser(req, res) {
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
}

// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";
import { ensureCommandRolesSchema } from "../../_roles.js";
import { parseBody } from "../http.js";
import {
    ensureCommandUploadSettingsSchema,
} from "../commandUploadSettings.js";
import { ensurePointsStatusConstraint } from "../pointsStatus.js";
import { createPointForCommand } from "../pointsWrite.js";

export async function handlePostPoint(req, res) {
    await ensureCommandRolesSchema();
    await ensureCommandUploadSettingsSchema();
    await ensurePointsStatusConstraint();

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

    const created = await createPointForCommand({
        command,
        id,
        benchmark,
        delay,
        area,
        description,
        fileName,
        status,
        checkerVersion,
        fileSize,
        batchSize,
    });
    if (!created.ok) {
        res.status(created.statusCode).json({ error: created.error });
        return;
    }
    res.status(201).json({
        point: created.point,
        quota: created.quota,
    });
}

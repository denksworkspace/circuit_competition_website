// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";
import { rejectMethod } from "./_lib/http.js";
import { ensurePointsStatusConstraint } from "./_lib/pointsStatus.js";
import { ensureCommandUploadSettingsSchema } from "./_lib/commandUploadSettings.js";
import { selectParetoRows } from "./_lib/pareto.js";

const DEFAULT_PARETO_EXPORT_BASELINE_UTC_MS = Date.UTC(2026, 2, 23, 0, 0, 0, 0);

function toUnixMs(valueRaw) {
    const value = Date.parse(String(valueRaw || ""));
    if (!Number.isFinite(value)) return null;
    return value;
}

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["GET"])) return;

    const authKey = String(req?.query?.authKey || "").trim();
    if (!authKey) {
        res.status(401).json({ error: "Missing auth key." });
        return;
    }

    await ensureCommandUploadSettingsSchema();
    await ensurePointsStatusConstraint();

    const authRes = await sql`
      select id, last_pareto_export_at
      from commands
      where auth_key = ${authKey}
      limit 1
    `;
    if (authRes.rows.length === 0) {
        res.status(401).json({ error: "Invalid auth key." });
        return;
    }
    const actor = authRes.rows[0];
    const lastParetoExportAt = actor?.last_pareto_export_at || null;
    const lastExportMs = toUnixMs(lastParetoExportAt) ?? DEFAULT_PARETO_EXPORT_BASELINE_UTC_MS;

    const pointsRes = await sql`
      select benchmark, delay, area, created_at
      from points
      where benchmark <> 'test'
        and file_name is not null
        and btrim(file_name) <> ''
        and lower(coalesce(lifecycle_status, 'main')) <> 'deleted'
      order by created_at desc
    `;
    const paretoRows = selectParetoRows(pointsRes.rows);
    const hasNewPareto = paretoRows.some((row) => {
        const createdAtMs = toUnixMs(row?.created_at);
        if (createdAtMs == null) return false;
        if (lastExportMs == null) return true;
        return createdAtMs > lastExportMs;
    });

    res.status(200).json({
        hasNewPareto,
        lastParetoExportAt,
    });
}

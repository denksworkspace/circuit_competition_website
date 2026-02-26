// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";
import { ensureCommandRolesSchema, ROLE_ADMIN } from "./_roles.js";
import { parseBody, rejectMethod } from "./_lib/http.js";
import { ensureCommandUploadSettingsSchema } from "./_lib/commandUploadSettings.js";
import { auditCircuitMetrics, downloadPointCircuitText } from "./_lib/pointVerification.js";
import { setVerifyProgress } from "./_lib/verifyProgress.js";

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["POST"])) return;

    const body = parseBody(req);
    const authKey = String(body?.authKey || "").trim();
    const pointId = body?.pointId ? String(body.pointId) : null;
    const progressToken = String(body?.progressToken || "").trim();
    const report = (status, patch = {}) => setVerifyProgress(progressToken, { status, ...patch });
    report("queued", { done: false, error: null });
    if (!authKey) {
        res.status(401).json({ error: "Missing auth key." });
        return;
    }

    await ensureCommandRolesSchema();
    await ensureCommandUploadSettingsSchema();
    report("auth");
    const authRes = await sql`
      select id, role, abc_metrics_timeout_seconds
      from commands
      where auth_key = ${authKey}
      limit 1
    `;
    if (authRes.rows.length === 0) {
        res.status(401).json({ error: "Invalid auth key." });
        return;
    }
    if (String(authRes.rows[0].role || "").toLowerCase() !== ROLE_ADMIN) {
        res.status(403).json({ error: "Only admin can run metrics audit." });
        return;
    }
    const metricsTimeoutMs = Math.max(1, Number(authRes.rows[0].abc_metrics_timeout_seconds || 60)) * 1000;

    const pointsRes = pointId
        ? await sql`
          select id, benchmark, delay, area, file_name
          from points
          where id = ${pointId}
            and benchmark <> 'test'
          order by created_at desc
        `
        : await sql`
          select id, benchmark, delay, area, file_name
          from points
          where benchmark <> 'test'
          order by created_at desc
        `;

    const mismatches = [];
    for (const point of pointsRes.rows) {
        const pointId = String(point.id);
        const benchmark = String(point.benchmark || "");
        const fileName = String(point.file_name || "");

        try {
            report("download_point");
            const downloaded = await downloadPointCircuitText(fileName, { signal: req?.abortSignal || null });
            if (!downloaded.ok) {
                mismatches.push({
                    pointId,
                    benchmark,
                    fileName,
                    reason: downloaded.reason,
                });
                continue;
            }
            const audited = await auditCircuitMetrics({
                delay: Number(point.delay),
                area: Number(point.area),
                circuitText: downloaded.circuitText,
                timeoutMs: metricsTimeoutMs,
                signal: req?.abortSignal || null,
                onProgress: (status) => report(status),
            });
            if (!audited.ok) {
                mismatches.push({
                    pointId,
                    benchmark,
                    fileName,
                    reason: audited.reason,
                });
                continue;
            }
            if (audited.mismatch) {
                mismatches.push({
                    pointId,
                    benchmark,
                    fileName,
                    reason: audited.reason,
                    actualDelay: audited.actualDelay,
                    actualArea: audited.actualArea,
                });
            }
        } catch (error) {
            mismatches.push({
                pointId,
                benchmark,
                fileName,
                reason: String(error?.message || "Metrics audit failed."),
            });
        }
    }

    res.status(200).json({
        ok: true,
        mismatches,
    });
    report("done", { done: true, error: null });
}

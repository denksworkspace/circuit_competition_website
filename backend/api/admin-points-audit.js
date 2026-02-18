// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";
import { ensureCommandRolesSchema, ROLE_ADMIN } from "./_roles.js";
import { parseBody, rejectMethod } from "./_lib/http.js";
import { auditCircuitMetrics, downloadPointCircuitText } from "./_lib/pointVerification.js";

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["POST"])) return;

    const body = parseBody(req);
    const authKey = String(body?.authKey || "").trim();
    const pointId = body?.pointId ? String(body.pointId) : null;
    if (!authKey) {
        res.status(401).json({ error: "Missing auth key." });
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
    if (String(authRes.rows[0].role || "").toLowerCase() !== ROLE_ADMIN) {
        res.status(403).json({ error: "Only admin can run metrics audit." });
        return;
    }

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
            const downloaded = await downloadPointCircuitText(fileName);
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
}

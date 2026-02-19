// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";
import { ensureCommandRolesSchema, ROLE_ADMIN } from "./_roles.js";
import { parseBody, rejectMethod } from "./_lib/http.js";
import { ensureCommandUploadSettingsSchema } from "./_lib/commandUploadSettings.js";
import {
    CHECKER_ABC,
    downloadPointCircuitText,
    normalizeCheckerVersion,
    verifyCircuitWithTruth,
} from "./_lib/pointVerification.js";

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["POST"])) return;

    const body = parseBody(req);
    const authKey = String(body?.authKey || "").trim();
    const checkerVersion = normalizeCheckerVersion(body?.checkerVersion || CHECKER_ABC);
    const pointId = body?.pointId ? String(body.pointId) : null;

    if (!authKey) {
        res.status(401).json({ error: "Missing auth key." });
        return;
    }
    if (checkerVersion !== CHECKER_ABC) {
        res.status(400).json({ error: "Unsupported checker for bulk verification." });
        return;
    }

    await ensureCommandRolesSchema();
    await ensureCommandUploadSettingsSchema();
    const authRes = await sql`
      select id, role, abc_verify_timeout_seconds
      from commands
      where auth_key = ${authKey}
      limit 1
    `;
    if (authRes.rows.length === 0) {
        res.status(401).json({ error: "Invalid auth key." });
        return;
    }
    if (String(authRes.rows[0].role || "").toLowerCase() !== ROLE_ADMIN) {
        res.status(403).json({ error: "Only admin can run bulk verification." });
        return;
    }
    const verifyTimeoutMs = Math.max(1, Number(authRes.rows[0].abc_verify_timeout_seconds || 60)) * 1000;

    const pointsRes = pointId
        ? await sql`
          select id, benchmark, file_name
          from points
          where id = ${pointId}
            and benchmark <> 'test'
          order by created_at desc
        `
        : await sql`
          select id, benchmark, file_name
          from points
          where benchmark <> 'test'
          order by created_at desc
        `;

    const log = [];
    for (const point of pointsRes.rows) {
        const pointId = String(point.id);
        const benchmark = String(point.benchmark || "");
        const fileName = String(point.file_name || "");

        try {
            const downloaded = await downloadPointCircuitText(fileName);
            if (!downloaded.ok) {
                log.push({
                    pointId,
                    benchmark,
                    fileName,
                    ok: false,
                    reason: downloaded.reason,
                    recommendedStatus: "non-verified",
                });
                continue;
            }

            const verified = await verifyCircuitWithTruth({
                benchmark,
                circuitText: downloaded.circuitText,
                timeoutMs: verifyTimeoutMs,
            });
            if (!verified.ok) {
                log.push({
                    pointId,
                    benchmark,
                    fileName,
                    ok: false,
                    reason: verified.reason,
                    recommendedStatus: "non-verified",
                });
                continue;
            }

            log.push({
                pointId,
                benchmark,
                fileName,
                ok: true,
                equivalent: verified.equivalent,
                recommendedStatus: verified.equivalent ? "verified" : "failed",
                checkerVersion,
                reason: verified.equivalent ? "Equivalent." : "Not equivalent.",
            });
        } catch (error) {
            log.push({
                pointId,
                benchmark,
                fileName,
                ok: false,
                reason: String(error?.message || "Verification failed."),
                recommendedStatus: "non-verified",
            });
        }
    }

    res.status(200).json({
        ok: true,
        checkerVersion,
        log,
    });
}

// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";
import { ensureCommandRolesSchema, ROLE_ADMIN } from "./_roles.js";
import { parseBody, rejectMethod } from "./_lib/http.js";
import { ensureCommandUploadSettingsSchema } from "./_lib/commandUploadSettings.js";
import {
    CHECKER_ABC,
    CHECKER_ABC_FAST_HEX,
    downloadPointCircuitText,
    normalizeCheckerVersion,
    verifyCircuitWithTruth,
} from "./_lib/pointVerification.js";
import { setVerifyProgress } from "./_lib/verifyProgress.js";

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["POST"])) return;

    const body = parseBody(req);
    const authKey = String(body?.authKey || "").trim();
    const checkerVersion = normalizeCheckerVersion(body?.checkerVersion || CHECKER_ABC);
    const pointId = body?.pointId ? String(body.pointId) : null;
    const includeVerified = Boolean(body?.includeVerified ?? true);
    const includeDeleted = Boolean(body?.includeDeleted ?? false);
    const progressToken = String(body?.progressToken || "").trim();
    const report = (status, patch = {}) => setVerifyProgress(progressToken, { status, ...patch });
    report("queued", { done: false, error: null, doneCount: 0, totalCount: 0, currentFileName: "" });

    if (!authKey) {
        res.status(401).json({ error: "Missing auth key." });
        return;
    }
    if (checkerVersion !== CHECKER_ABC && checkerVersion !== CHECKER_ABC_FAST_HEX) {
        res.status(400).json({ error: "Unsupported checker for bulk verification." });
        return;
    }

    await ensureCommandRolesSchema();
    await ensureCommandUploadSettingsSchema();
    report("auth");
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
    const verifyTimeoutSeconds = Math.max(1, Number(authRes.rows[0].abc_verify_timeout_seconds || 60));
    const verifyTimeoutMs = verifyTimeoutSeconds * 1000;

    const pointsRes = pointId
        ? await sql`
          select id, benchmark, file_name, status, lifecycle_status
          from points
          where id = ${pointId}
            and benchmark <> 'test'
            and (${includeDeleted}::boolean or lower(coalesce(lifecycle_status, 'main')) <> 'deleted')
          order by created_at desc
        `
        : await sql`
          select id, benchmark, file_name, status, lifecycle_status
          from points
          where benchmark <> 'test'
            and (${includeVerified}::boolean or lower(coalesce(status, '')) <> 'verified')
            and (${includeDeleted}::boolean or lower(coalesce(lifecycle_status, 'main')) <> 'deleted')
          order by created_at desc
        `;

    const log = [];
    const totalCount = Number(pointsRes.rows.length || 0);
    let doneCount = 0;
    report("scan", { done: false, error: null, doneCount, totalCount, currentFileName: "" });
    for (const point of pointsRes.rows) {
        const pointId = String(point.id);
        const benchmark = String(point.benchmark || "");
        const fileName = String(point.file_name || "");
        const sourceStatus = String(point.lifecycle_status || "").trim().toLowerCase() || "main";
        report("scan", { done: false, error: null, doneCount, totalCount, currentFileName: fileName });

        try {
            report("download_point", { done: false, error: null, doneCount, totalCount, currentFileName: fileName });
            const downloaded = await downloadPointCircuitText(fileName, { signal: req?.abortSignal || null });
            if (!downloaded.ok) {
                log.push({
                    pointId,
                    benchmark,
                    fileName,
                    sourceStatus,
                    ok: false,
                    reason: downloaded.reason,
                    recommendedStatus: "non-verified",
                });
                doneCount += 1;
                report("scan", { done: false, error: null, doneCount, totalCount, currentFileName: fileName });
                continue;
            }

            const verified = await verifyCircuitWithTruth({
                benchmark,
                circuitText: downloaded.circuitText,
                checkerVersion,
                timeoutMs: verifyTimeoutMs,
                timeoutSeconds: verifyTimeoutSeconds,
                signal: req?.abortSignal || null,
                onProgress: (status) => report(status),
            });
            if (!verified.ok) {
                log.push({
                    pointId,
                    benchmark,
                    fileName,
                    sourceStatus,
                    ok: false,
                    reason: verified.reason,
                    recommendedStatus: "non-verified",
                });
                doneCount += 1;
                report("scan", { done: false, error: null, doneCount, totalCount, currentFileName: fileName });
                continue;
            }

            log.push({
                pointId,
                benchmark,
                fileName,
                sourceStatus,
                ok: true,
                equivalent: verified.equivalent,
                recommendedStatus: verified.equivalent ? "verified" : "failed",
                checkerVersion,
                reason: verified.equivalent ? "Equivalent." : "Not equivalent.",
            });
            doneCount += 1;
            report("scan", { done: false, error: null, doneCount, totalCount, currentFileName: fileName });
        } catch (error) {
            log.push({
                pointId,
                benchmark,
                fileName,
                sourceStatus,
                ok: false,
                reason: String(error?.message || "Verification failed."),
                recommendedStatus: "non-verified",
            });
            doneCount += 1;
            report("scan", { done: false, error: null, doneCount, totalCount, currentFileName: fileName });
        }
    }

    res.status(200).json({
        ok: true,
        checkerVersion,
        log,
    });
    report("done", { done: true, error: null, doneCount, totalCount, currentFileName: "" });
}

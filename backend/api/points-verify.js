// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";
import { ensureCommandRolesSchema, ROLE_ADMIN } from "./_roles.js";
import { parseBody, rejectMethod } from "./_lib/http.js";
import { ensureCommandUploadSettingsSchema } from "./_lib/commandUploadSettings.js";
import {
    CHECKER_ABC,
    CHECKER_ABC_FAST_HEX,
    CHECKER_NONE,
    downloadPointCircuitText,
    normalizeCheckerVersion,
    verifyCircuitWithTruth,
} from "./_lib/pointVerification.js";
import { setVerifyProgress } from "./_lib/verifyProgress.js";

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["POST"])) return;

    const body = parseBody(req);
    const authKey = String(body?.authKey || "").trim();
    let benchmark = String(body?.benchmark || "").trim();
    let circuitText = String(body?.circuitText || "");
    const pointId = body?.pointId ? String(body.pointId) : null;
    const applyStatus = Boolean(body?.applyStatus);
    const checkerVersion = normalizeCheckerVersion(body?.checkerVersion);
    const progressToken = String(body?.progressToken || "").trim();
    const requestedTimeoutSecondsRaw = body?.timeoutSeconds;
    const report = (status, patch = {}) => setVerifyProgress(progressToken, { status, ...patch });
    report("queued", { done: false, error: null });

    if (!authKey) {
        res.status(401).json({ error: "Missing auth key." });
        return;
    }
    if (!benchmark && !pointId) {
        res.status(400).json({ error: "Missing benchmark or point id." });
        return;
    }
    if (checkerVersion === CHECKER_NONE) {
        res.status(400).json({ error: "Checker is not selected." });
        return;
    }
    if (checkerVersion !== CHECKER_ABC && checkerVersion !== CHECKER_ABC_FAST_HEX) {
        res.status(400).json({ error: "Unsupported checker." });
        return;
    }

    await ensureCommandRolesSchema();
    await ensureCommandUploadSettingsSchema();
    report("auth");
    const authRes = await sql`
      select id, role, name, abc_verify_timeout_seconds
      from commands
      where auth_key = ${authKey}
      limit 1
    `;
    if (authRes.rows.length === 0) {
        res.status(401).json({ error: "Invalid auth key." });
        return;
    }
    const actor = authRes.rows[0];
    const verifyTimeoutLimitSeconds = Math.max(1, Number(actor.abc_verify_timeout_seconds || 60));
    let verifyTimeoutSeconds = verifyTimeoutLimitSeconds;
    if (requestedTimeoutSecondsRaw !== undefined && requestedTimeoutSecondsRaw !== null && requestedTimeoutSecondsRaw !== "") {
        const parsed = Number(requestedTimeoutSecondsRaw);
        if (!Number.isFinite(parsed) || parsed < 1) {
            res.status(400).json({ error: "Invalid timeoutSeconds. Expected a positive integer." });
            return;
        }
        verifyTimeoutSeconds = Math.min(verifyTimeoutLimitSeconds, Math.floor(parsed));
    }
    const verifyTimeoutMs = verifyTimeoutSeconds * 1000;

    let pointRow = null;
    if (pointId) {
        const pointRes = await sql`
          select id, benchmark, sender, file_name
          from points
          where id = ${pointId}
          limit 1
        `;
        if (pointRes.rows.length === 0) {
            res.status(404).json({ error: "Point not found." });
            return;
        }
        pointRow = pointRes.rows[0];
        benchmark = String(pointRow.benchmark || "");
        if (benchmark === "test") {
            res.status(400).json({ error: "Only numeric benchmarks can be verified." });
            return;
        }
        if (!circuitText) {
            report("download_point");
            const downloaded = await downloadPointCircuitText(String(pointRow.file_name || ""));
            if (!downloaded.ok) {
                res.status(422).json({ error: downloaded.reason || "Failed to download point file." });
                return;
            }
            circuitText = downloaded.circuitText;
        }
    }

    if (!benchmark || benchmark === "test") {
        res.status(400).json({ error: "Only numeric benchmarks can be verified." });
        return;
    }
    if (!circuitText) {
        res.status(400).json({ error: "Missing circuit text." });
        return;
    }

    const result = await verifyCircuitWithTruth({
        benchmark,
        circuitText,
        checkerVersion,
        timeoutMs: verifyTimeoutMs,
        timeoutSeconds: verifyTimeoutSeconds,
        onProgress: (status) => report(status),
        signal: req?.abortSignal || null,
    });
    if (!result.ok) {
        report("error", { done: true, error: result.reason || result.code || "VERIFY_FAILED" });
        const statusCode = result.code === "TRUTH_NOT_FOUND" ? 404 : (result.code === "ABC_ABORTED" ? 499 : 422);
        res.status(statusCode).json({
            error: result.reason,
            code: result.code || "VERIFY_FAILED",
        });
        return;
    }

    const nextStatus = result.equivalent ? "verified" : "failed";
    if (applyStatus && pointId) {
        const point = pointRow || { sender: null };
        const isAdmin = String(actor.role || "").toLowerCase() === ROLE_ADMIN;
        const isOwner = String(point.sender || "") === String(actor.name || "");
        if (!isAdmin && !isOwner) {
            res.status(403).json({ error: "Cannot update status for another command point." });
            return;
        }
        await sql`
          update points
          set status = ${nextStatus},
              checker_version = ${checkerVersion}
          where id = ${pointId}
        `;
    }

    res.status(200).json({
        ok: true,
        equivalent: result.equivalent,
        status: nextStatus,
        checkerVersion,
        script: String(result.script || ""),
    });
    report("done", { done: true, error: null });
}

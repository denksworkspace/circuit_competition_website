// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";
import { ensureCommandRolesSchema } from "./_roles.js";
import { parseBody, rejectMethod } from "./_lib/http.js";
import { parseInputBenchFileName } from "./_lib/benchInputName.js";
import { getAigStatsFromBenchText } from "./_lib/abc.js";
import { ensureCommandUploadSettingsSchema } from "./_lib/commandUploadSettings.js";

const MAX_VERIFY_FILES = 100;

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["POST"])) return;

    const body = parseBody(req);
    const authKey = String(body?.authKey || "").trim();
    const files = Array.isArray(body?.files) ? body.files : [];
    const requestedTimeoutSecondsRaw = body?.timeoutSeconds;

    if (!authKey) {
        res.status(401).json({ error: "Missing auth key." });
        return;
    }

    if (files.length < 1 || files.length > MAX_VERIFY_FILES) {
        res.status(400).json({ error: `Invalid files payload. Expected 1..${MAX_VERIFY_FILES} files.` });
        return;
    }

    await ensureCommandRolesSchema();
    await ensureCommandUploadSettingsSchema();
    const authRes = await sql`
      select id, abc_metrics_timeout_seconds
      from commands
      where auth_key = ${authKey}
      limit 1
    `;
    if (authRes.rows.length === 0) {
        res.status(401).json({ error: "Invalid auth key." });
        return;
    }
    const metricsTimeoutLimitSeconds = Math.max(1, Number(authRes.rows[0].abc_metrics_timeout_seconds || 60));
    let metricsTimeoutSeconds = metricsTimeoutLimitSeconds;
    if (requestedTimeoutSecondsRaw !== undefined && requestedTimeoutSecondsRaw !== null && requestedTimeoutSecondsRaw !== "") {
        const parsed = Number(requestedTimeoutSecondsRaw);
        if (!Number.isFinite(parsed) || parsed < 1) {
            res.status(400).json({ error: "Invalid timeoutSeconds. Expected a positive integer." });
            return;
        }
        metricsTimeoutSeconds = Math.min(metricsTimeoutLimitSeconds, Math.floor(parsed));
    }
    const metricsTimeoutMs = metricsTimeoutSeconds * 1000;

    const results = [];
    for (const item of files) {
        const fileName = String(item?.fileName || "").trim();
        const circuitText = String(item?.circuitText || "");
        if (!fileName || !circuitText) {
            results.push({
                fileName: fileName || "<unknown>",
                ok: false,
                reason: "Missing fileName or circuitText.",
            });
            continue;
        }

        const parsed = parseInputBenchFileName(fileName);
        if (!parsed.ok) {
            results.push({
                fileName,
                ok: false,
                reason: parsed.error,
            });
            continue;
        }

        const stats = await getAigStatsFromBenchText(circuitText, { timeoutMs: metricsTimeoutMs });
        if (!stats.ok) {
            results.push({
                fileName,
                ok: false,
                reason: stats.message || "Failed to compute metrics with ABC.",
            });
            continue;
        }

        const mismatches = [];
        if (stats.area !== parsed.area) {
            mismatches.push(`area expected ${parsed.area}, actual ${stats.area}`);
        }
        if (stats.depth !== parsed.delay) {
            mismatches.push(`delay expected ${parsed.delay}, actual ${stats.depth}`);
        }

        if (mismatches.length > 0) {
            results.push({
                fileName,
                ok: false,
                reason: `Metric mismatch: ${mismatches.join("; ")}`,
                expected: { area: parsed.area, delay: parsed.delay },
                actual: { area: stats.area, delay: stats.depth },
            });
            continue;
        }

        results.push({
            fileName,
            ok: true,
            expected: { area: parsed.area, delay: parsed.delay },
            actual: { area: stats.area, delay: stats.depth },
        });
    }

    const failed = results.filter((row) => !row.ok);
    if (failed.length > 0) {
        res.status(422).json({
            ok: false,
            error: "Circuit metrics do not match file names.",
            files: results,
        });
        return;
    }

    res.status(200).json({
        ok: true,
        files: results,
    });
}

// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";
import { ensureCommandRolesSchema, ROLE_ADMIN } from "./_roles.js";
import { parseBody, rejectMethod } from "./_lib/http.js";
import {
    benchmarkExists,
    getTruthTableByBenchmark,
    parseTruthFileName,
} from "./_lib/truthTables.js";

const MAX_FILES = 100;

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["POST"])) return;

    const body = parseBody(req);
    const authKey = String(body?.authKey || "").trim();
    const fileNames = Array.isArray(body?.fileNames) ? body.fileNames : [];

    if (!authKey) {
        res.status(401).json({ error: "Missing auth key." });
        return;
    }
    if (fileNames.length < 1 || fileNames.length > MAX_FILES) {
        res.status(400).json({ error: `Invalid files payload. Expected 1..${MAX_FILES} files.` });
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
    const actor = authRes.rows[0];
    if (String(actor.role || "").toLowerCase() !== ROLE_ADMIN) {
        res.status(403).json({ error: "Only admin can prepare truth uploads." });
        return;
    }

    const seenBenchmarks = new Set();
    const files = [];

    for (const rawName of fileNames) {
        const fileName = String(rawName || "").trim();
        const parsed = parseTruthFileName(fileName);
        if (!parsed.ok) {
            files.push({
                fileName,
                ok: false,
                benchmark: null,
                action: "invalid",
                reason: parsed.error,
            });
            continue;
        }

        if (seenBenchmarks.has(parsed.benchmark)) {
            files.push({
                fileName: parsed.fileName,
                ok: false,
                benchmark: parsed.benchmark,
                action: "invalid",
                reason: `Duplicate benchmark in batch: ${parsed.benchmark}.`,
            });
            continue;
        }
        seenBenchmarks.add(parsed.benchmark);

        const existingTruth = await getTruthTableByBenchmark(parsed.benchmark);
        const existsBenchmark = await benchmarkExists(parsed.benchmark);

        if (existingTruth) {
            files.push({
                fileName: parsed.fileName,
                ok: false,
                benchmark: parsed.benchmark,
                action: "requires_replace",
                reason: `Truth file already exists for benchmark ${parsed.benchmark}.`,
                existingTruthFileName: existingTruth.fileName,
            });
            continue;
        }

        if (!existsBenchmark) {
            files.push({
                fileName: parsed.fileName,
                ok: false,
                benchmark: parsed.benchmark,
                action: "requires_create_benchmark",
                reason: `Benchmark ${parsed.benchmark} does not exist.`,
            });
            continue;
        }

        files.push({
            fileName: parsed.fileName,
            ok: true,
            benchmark: parsed.benchmark,
            action: "ready",
            reason: "Ready to upload.",
        });
    }

    res.status(200).json({
        ok: true,
        files,
    });
}

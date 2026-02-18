// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";
import { ensureCommandRolesSchema, ROLE_ADMIN } from "./_roles.js";
import { parseBody, rejectMethod } from "./_lib/http.js";
import {
    benchmarkExists,
    ensureBenchmarkExists,
    ensureTruthTablesSchema,
    getTruthTableByBenchmark,
    parseTruthFileName,
} from "./_lib/truthTables.js";
import { addActionLog } from "./_lib/actionLogs.js";

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["POST"])) return;

    const body = parseBody(req);
    const authKey = String(body?.authKey || "").trim();
    const fileName = String(body?.fileName || "").trim();
    const allowReplace = Boolean(body?.allowReplace);
    const allowCreateBenchmark = Boolean(body?.allowCreateBenchmark);

    if (!authKey) {
        res.status(401).json({ error: "Missing auth key." });
        return;
    }
    const parsed = parseTruthFileName(fileName);
    if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
    }

    await ensureCommandRolesSchema();
    await ensureTruthTablesSchema();

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
        res.status(403).json({ error: "Only admin can save truth tables." });
        return;
    }

    const benchmark = parsed.benchmark;
    const existsBenchmark = await benchmarkExists(benchmark);
    if (!existsBenchmark && !allowCreateBenchmark) {
        res.status(409).json({
            error: `Benchmark ${benchmark} does not exist.`,
            code: "BENCHMARK_MISSING",
        });
        return;
    }
    if (!existsBenchmark && allowCreateBenchmark) {
        await ensureBenchmarkExists(benchmark, Number(actor.id));
    }

    const existingTruth = await getTruthTableByBenchmark(benchmark);
    if (existingTruth && !allowReplace) {
        res.status(409).json({
            error: `Truth file already exists for benchmark ${benchmark}.`,
            code: "TRUTH_EXISTS",
            existingTruthFileName: existingTruth.fileName,
        });
        return;
    }

    await sql`
      insert into truth_tables (benchmark, file_name, uploaded_by_command_id)
      values (${benchmark}, ${parsed.fileName}, ${actor.id})
      on conflict (benchmark)
      do update
      set file_name = excluded.file_name,
          uploaded_by_command_id = excluded.uploaded_by_command_id,
          updated_at = now()
    `;

    if (existingTruth) {
        await sql`
          update points
          set status = 'non-verified',
              checker_version = null
          where benchmark = ${benchmark}
        `;
    }

    await addActionLog({
        commandId: Number(actor.id),
        actorCommandId: Number(actor.id),
        action: "truth_uploaded",
        details: {
            benchmark,
            fileName: parsed.fileName,
            replaced: Boolean(existingTruth),
            createdBenchmark: !existsBenchmark && allowCreateBenchmark,
            resetPointsToNonVerified: Boolean(existingTruth),
        },
    });

    res.status(200).json({
        ok: true,
        benchmark,
        fileName: parsed.fileName,
        replaced: Boolean(existingTruth),
        createdBenchmark: !existsBenchmark && allowCreateBenchmark,
    });
}

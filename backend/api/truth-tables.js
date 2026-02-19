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
import {
    DEFAULT_MAX_MULTI_FILE_BATCH_COUNT,
    ensureCommandUploadSettingsSchema,
    normalizeCommandUploadSettings,
} from "./_lib/commandUploadSettings.js";

const MAX_TRUTH_BATCH_FILES = 100;

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["POST"])) return;

    const body = parseBody(req);
    const authKey = String(body?.authKey || "").trim();
    const fileName = String(body?.fileName || "").trim();
    const fileSize = Number(body?.fileSize);
    const normalizedBatchSize = Number(body?.batchSize ?? 1);
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
    if (!Number.isFinite(fileSize) || fileSize < 0) {
        res.status(400).json({ error: "Invalid file size." });
        return;
    }
    if (!Number.isInteger(normalizedBatchSize) || normalizedBatchSize < 1) {
        res.status(400).json({ error: "Invalid batch size." });
        return;
    }
    if (normalizedBatchSize > MAX_TRUTH_BATCH_FILES) {
        res.status(400).json({ error: `Too many files in batch. Maximum is ${MAX_TRUTH_BATCH_FILES}.` });
        return;
    }

    await ensureCommandRolesSchema();
    await ensureCommandUploadSettingsSchema();
    await ensureTruthTablesSchema();

    const authRes = await sql`
      select id, role, max_single_upload_bytes, total_upload_quota_bytes, uploaded_bytes_total, max_multi_file_batch_count
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
    const uploadSettings = normalizeCommandUploadSettings(actor);
    const configuredMaxBatch = Math.max(
        1,
        Number(uploadSettings.maxMultiFileBatchCount || DEFAULT_MAX_MULTI_FILE_BATCH_COUNT)
    );
    const maxBatchCount = Math.min(configuredMaxBatch, MAX_TRUTH_BATCH_FILES);
    if (normalizedBatchSize > maxBatchCount) {
        res.status(400).json({ error: `Too many files in batch. Maximum is ${maxBatchCount}.` });
        return;
    }
    if (fileSize > uploadSettings.maxSingleUploadBytes) {
        res.status(413).json({
            error: `File is too large. Maximum size is ${(uploadSettings.maxSingleUploadBytes / (1024 ** 3)).toFixed(2)} GB.`,
        });
        return;
    }
    const chargeBytes = normalizedBatchSize > 1 ? fileSize : 0;
    if (chargeBytes > uploadSettings.remainingUploadBytes) {
        res.status(413).json({
            error: `Multi-file quota exceeded. Remaining: ${(uploadSettings.remainingUploadBytes / (1024 ** 3)).toFixed(2)} GB.`,
        });
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

    try {
        if (chargeBytes > 0) {
            const quotaUpdate = await sql`
              update commands
              set uploaded_bytes_total = uploaded_bytes_total + ${chargeBytes}::bigint
              where id = ${actor.id}
                and uploaded_bytes_total + ${chargeBytes}::bigint <= total_upload_quota_bytes
              returning id
            `;
            if (quotaUpdate.rows.length === 0) {
                res.status(413).json({
                    error: `Multi-file quota exceeded. Remaining: ${(uploadSettings.remainingUploadBytes / (1024 ** 3)).toFixed(2)} GB.`,
                });
                return;
            }
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
                chargedBytes: chargeBytes,
                isMultiFileBatch: normalizedBatchSize > 1,
            },
        });
    } catch (error) {
        if (chargeBytes > 0) {
            await sql`
              update commands
              set uploaded_bytes_total = greatest(0::bigint, uploaded_bytes_total - ${chargeBytes}::bigint)
              where id = ${actor.id}
            `;
        }
        res.status(500).json({ error: "Failed to save truth table." });
        return;
    }

    res.status(200).json({
        ok: true,
        benchmark,
        fileName: parsed.fileName,
        replaced: Boolean(existingTruth),
        createdBenchmark: !existsBenchmark && allowCreateBenchmark,
    });
}

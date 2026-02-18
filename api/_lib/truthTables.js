// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
/* global process */
import { sql } from "@vercel/postgres";

const TRUTH_FILE_RE = /^bench(2\d\d)\.truth$/i;

let truthTablesSchemaReadyPromise = null;

function normalizeCloudFrontDomain(raw) {
    const trimmed = String(raw || "").trim();
    if (!trimmed) return "";
    return trimmed.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

const cloudFrontDomain = normalizeCloudFrontDomain(process.env.CLOUDFRONT_DOMAIN);

export function parseTruthFileName(fileNameRaw) {
    const fileName = String(fileNameRaw || "").trim();
    if (!fileName) {
        return { ok: false, error: "Empty file name." };
    }
    const match = fileName.match(TRUTH_FILE_RE);
    if (!match) {
        return {
            ok: false,
            error: "Invalid truth file name. Expected: bench{200..299}.truth",
        };
    }
    const benchmark = String(Number(match[1]));
    return {
        ok: true,
        fileName,
        benchmark,
    };
}

export function buildTruthObjectKey(fileName) {
    return `truth_tables/${fileName}`;
}

export function buildTruthDownloadUrl(fileName) {
    if (!cloudFrontDomain || !fileName) return null;
    const encodedKey = buildTruthObjectKey(fileName)
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");
    return `https://${cloudFrontDomain}/${encodedKey}`;
}

export async function ensureTruthTablesSchema() {
    if (!truthTablesSchemaReadyPromise) {
        truthTablesSchemaReadyPromise = (async () => {
            await sql`
              create table if not exists benchmark_registry (
                benchmark text primary key,
                created_by_command_id bigint references commands(id) on delete set null,
                created_at timestamptz not null default now()
              )
            `;
            await sql`
              create table if not exists truth_tables (
                benchmark text primary key,
                file_name text not null unique,
                uploaded_by_command_id bigint references commands(id) on delete set null,
                created_at timestamptz not null default now(),
                updated_at timestamptz not null default now()
              )
            `;
            await sql`
              insert into benchmark_registry (benchmark)
              select distinct benchmark
              from points
              where benchmark is not null
                and benchmark <> 'test'
              on conflict (benchmark) do nothing
            `;
        })().catch((error) => {
            truthTablesSchemaReadyPromise = null;
            throw error;
        });
    }
    return truthTablesSchemaReadyPromise;
}

export async function benchmarkExists(benchmarkRaw) {
    const benchmark = String(benchmarkRaw || "").trim();
    if (!benchmark) return false;
    await ensureTruthTablesSchema();
    const result = await sql`
      select exists(
        select 1 from benchmark_registry where benchmark = ${benchmark}
      ) as exists
    `;
    return Boolean(result.rows[0]?.exists);
}

export async function ensureBenchmarkExists(benchmarkRaw, actorCommandId = null) {
    const benchmark = String(benchmarkRaw || "").trim();
    if (!benchmark) return;
    await ensureTruthTablesSchema();
    await sql`
      insert into benchmark_registry (benchmark, created_by_command_id)
      values (${benchmark}, ${actorCommandId})
      on conflict (benchmark) do nothing
    `;
}

export async function getTruthTableByBenchmark(benchmarkRaw) {
    const benchmark = String(benchmarkRaw || "").trim();
    if (!benchmark) return null;
    await ensureTruthTablesSchema();
    const result = await sql`
      select benchmark, file_name, uploaded_by_command_id, created_at, updated_at
      from truth_tables
      where benchmark = ${benchmark}
      limit 1
    `;
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
        benchmark: row.benchmark,
        fileName: row.file_name,
        uploadedByCommandId: row.uploaded_by_command_id == null ? null : Number(row.uploaded_by_command_id),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        fileKey: buildTruthObjectKey(row.file_name),
        downloadUrl: buildTruthDownloadUrl(row.file_name),
    };
}

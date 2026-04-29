// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";
import { rejectMethod } from "./_lib/http.js";
import { ensureCommandRolesSchema } from "./_roles.js";
import { ensureCommandUploadSettingsSchema } from "./_lib/commandUploadSettings.js";
import { ensureTruthTablesSchema } from "./_lib/truthTables.js";
import { ensureActionLogsSchema } from "./_lib/actionLogs.js";
import { authenticateAdmin } from "./_lib/adminUsers/utils.js";
import { setExportProgress } from "./_lib/exportProgress.js";
import { ensureUploadQueueSchema } from "./_lib/uploadQueue.js";
import { ensureMaintenanceSettingsSchema } from "./_lib/maintenanceMode.js";
import { ensureSiteActivityLogsSchema } from "./_lib/siteActivityLogs.js";
import { ensurePointsStatusConstraint } from "./_lib/pointsStatus.js";

function buildFileName() {
    return `database-export-${new Date().toISOString().replace(/[:.]/g, "-")}.sql`;
}

const BACKUP_TABLES = [
    "commands",
    "app_runtime_settings",
    "benchmark_registry",
    "truth_tables",
    "points",
    "upload_requests",
    "upload_request_files",
    "command_action_logs",
    "site_activity_logs",
];

const ID_SEQUENCE_TABLES = new Set([
    "commands",
    "command_action_logs",
    "site_activity_logs",
]);

function quoteIdentifier(identRaw) {
    const ident = String(identRaw || "");
    return `"${ident.replace(/"/g, "\"\"")}"`;
}

function quotePublicTable(tableName) {
    return `"public".${quoteIdentifier(tableName)}`;
}

function toSqlLiteral(value) {
    if (value == null) return "NULL";
    if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
    if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
    if (typeof value === "bigint") return String(value);
    if (value instanceof Date) return `'${value.toISOString().replace(/'/g, "''")}'`;
    if (typeof value === "object") {
        const json = JSON.stringify(value);
        return `'${String(json).replace(/'/g, "''")}'::jsonb`;
    }
    return `'${String(value).replace(/'/g, "''")}'`;
}

async function getTableColumns(tableName) {
    const result = await sql`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = ${tableName}
      order by ordinal_position asc
    `;
    return result.rows.map((row) => String(row.column_name || "")).filter(Boolean);
}

function buildInsertStatements(tableName, columns, rows) {
    if (!Array.isArray(rows) || rows.length === 0 || !Array.isArray(columns) || columns.length === 0) return [];
    const quotedColumns = columns.map(quoteIdentifier).join(", ");
    const tableIdent = quotePublicTable(tableName);
    const statements = [];
    for (const row of rows) {
        const values = columns.map((column) => toSqlLiteral(row[column])).join(", ");
        statements.push(`INSERT INTO ${tableIdent} (${quotedColumns}) VALUES (${values});`);
    }
    return statements;
}

function buildIdSequenceResetStatement(tableName) {
    if (!ID_SEQUENCE_TABLES.has(tableName)) return null;
    const tableIdent = quotePublicTable(tableName);
    const tableNameLiteral = toSqlLiteral(`public.${tableName}`);
    return [
        "SELECT setval(",
        `  pg_get_serial_sequence(${tableNameLiteral}, 'id'),`,
        `  COALESCE((SELECT MAX("id") FROM ${tableIdent}), 1),`,
        `  EXISTS(SELECT 1 FROM ${tableIdent})`,
        ")",
        `WHERE pg_get_serial_sequence(${tableNameLiteral}, 'id') IS NOT NULL;`,
    ].join("\n");
}

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["GET"])) return;

    const authKey = String(req?.query?.authKey || "").trim();
    const progressToken = String(req?.query?.progressToken || "").trim();
    if (!authKey) {
        res.status(400).json({ error: "Missing auth key." });
        return;
    }

    await ensureCommandRolesSchema();
    await ensureCommandUploadSettingsSchema();
    await ensurePointsStatusConstraint();
    await ensureTruthTablesSchema();
    await ensureUploadQueueSchema();
    await ensureMaintenanceSettingsSchema();
    await ensureActionLogsSchema();
    await ensureSiteActivityLogsSchema();

    const admin = await authenticateAdmin(authKey);
    if (!admin) {
        res.status(403).json({ error: "Admin access required." });
        return;
    }

    setExportProgress(progressToken, {
        type: "database_sql",
        status: "collecting_data",
        unit: "tables",
        done: 0,
        total: BACKUP_TABLES.length,
        doneFlag: false,
        error: null,
    });

    try {
        const [
            commandsRes,
            settingsRes,
            benchmarksRes,
            truthRes,
            pointsRes,
            uploadRequestsRes,
            uploadRequestFilesRes,
            logsRes,
            siteLogsRes,
        ] = await Promise.all([
            sql`select * from public.commands order by id asc`,
            sql`select * from public.app_runtime_settings order by key asc`,
            sql`select * from public.benchmark_registry order by benchmark asc`,
            sql`select * from public.truth_tables order by benchmark asc`,
            sql`select * from public.points order by id asc`,
            sql`select * from public.upload_requests order by created_at asc, id asc`,
            sql`select * from public.upload_request_files order by request_id asc, order_index asc, id asc`,
            sql`select * from public.command_action_logs order by id asc`,
            sql`select * from public.site_activity_logs order by id asc`,
        ]);

        const tableRows = {
            commands: commandsRes.rows,
            app_runtime_settings: settingsRes.rows,
            benchmark_registry: benchmarksRes.rows,
            truth_tables: truthRes.rows,
            points: pointsRes.rows,
            upload_requests: uploadRequestsRes.rows,
            upload_request_files: uploadRequestFilesRes.rows,
            command_action_logs: logsRes.rows,
            site_activity_logs: siteLogsRes.rows,
        };

        const columnsByTable = {};
        for (const tableName of BACKUP_TABLES) {
            if (req?.abortSignal?.aborted) {
                setExportProgress(progressToken, { status: "cancelled", doneFlag: true });
                return;
            }
            columnsByTable[tableName] = await getTableColumns(tableName);
        }

        const lines = [];
        lines.push("-- circuit_control_version database backup");
        lines.push(`-- exported_at: ${new Date().toISOString()}`);
        lines.push(`-- exported_by_command_id: ${Number(admin.id)}`);
        lines.push("BEGIN;");
        lines.push(`TRUNCATE TABLE ${BACKUP_TABLES.map(quotePublicTable).join(", ")} RESTART IDENTITY CASCADE;`);

        let doneTables = 0;
        for (const tableName of BACKUP_TABLES) {
            if (req?.abortSignal?.aborted) {
                setExportProgress(progressToken, { status: "cancelled", doneFlag: true, done: doneTables });
                return;
            }
            const rows = tableRows[tableName] || [];
            const columns = columnsByTable[tableName] || [];
            lines.push(`-- ${tableName}: ${rows.length} rows`);
            lines.push(...buildInsertStatements(tableName, columns, rows));
            const sequenceReset = buildIdSequenceResetStatement(tableName);
            if (sequenceReset) lines.push(sequenceReset);
            doneTables += 1;
            setExportProgress(progressToken, {
                status: "building_sql",
                done: doneTables,
                total: BACKUP_TABLES.length,
            });
        }

        lines.push("COMMIT;");

        const fileName = buildFileName();
        const body = Buffer.from(`${lines.join("\n")}\n`, "utf8");
        setExportProgress(progressToken, {
            status: "done",
            done: BACKUP_TABLES.length,
            total: BACKUP_TABLES.length,
            doneFlag: true,
        });
        res.setHeader("Content-Type", "text/sql; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
        res.setHeader("Cache-Control", "no-store");
        res.end(body);
    } catch (error) {
        const aborted = req?.abortSignal?.aborted || String(error?.name || "").toLowerCase() === "aborterror";
        setExportProgress(progressToken, {
            status: aborted ? "cancelled" : "error",
            doneFlag: true,
            error: aborted ? null : "Failed to build database backup.",
        });
        if (aborted) return;
        res.status(500).json({ error: "Failed to build database backup." });
    }
}

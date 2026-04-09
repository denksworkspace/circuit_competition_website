// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";
import { rejectMethod } from "./_lib/http.js";
import { ensurePointsStatusConstraint } from "./_lib/pointsStatus.js";
import { ensureCommandUploadSettingsSchema } from "./_lib/commandUploadSettings.js";
import { buildDownloadUrl } from "./_lib/points.js";
import { buildZipBuffer } from "./_lib/zip.js";
import { selectParetoRows } from "./_lib/pareto.js";
import { setExportProgress } from "./_lib/exportProgress.js";

const DEFAULT_PARETO_EXPORT_BASELINE_UTC_MS = Date.UTC(2026, 2, 23, 0, 0, 0, 0);
const CUSTOM_EXPORT_DATE_RANGE_DAYS = 7;
const CUSTOM_EXPORT_DATE_RANGE_MS = CUSTOM_EXPORT_DATE_RANGE_DAYS * 24 * 60 * 60 * 1000;
const ALL_POINT_STATUSES = ["non-verified", "verified", "failed"];
const ALLOWED_POINT_STATUSES = new Set(ALL_POINT_STATUSES);

function buildExportFileName() {
    return `pareto-points-export-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
}

function parseMode(raw) {
    const mode = String(raw || "").trim().toLowerCase();
    if (mode === "from_date") return "from_date";
    return "all_new";
}

function parseParetoOnly(raw) {
    const value = String(raw ?? "1").trim().toLowerCase();
    if (value === "0" || value === "false") return false;
    return true;
}

function parseManualSynthesisOnly(raw) {
    const value = String(raw ?? "0").trim().toLowerCase();
    if (value === "1" || value === "true") return true;
    return false;
}

function parseIncludedStatuses(raw) {
    if (raw == null) return [...ALL_POINT_STATUSES];
    const values = Array.isArray(raw) ? raw : [raw];
    return Array.from(
        new Set(
            values
                .flatMap((value) => String(value || "").split(","))
                .map((status) => status.trim().toLowerCase())
                .filter((status) => ALLOWED_POINT_STATUSES.has(status))
        )
    );
}

function normalizeBench(raw) {
    const value = String(raw || "all").trim().toLowerCase();
    if (!value || value === "all") return "all";
    if (!/^\d+$/.test(value)) return null;
    return String(Number(value));
}

function parseDateStartUtcMs(raw) {
    const value = String(raw || "").trim();
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
    const utcMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
    const date = new Date(utcMs);
    if (
        date.getUTCFullYear() !== year
        || date.getUTCMonth() !== month - 1
        || date.getUTCDate() !== day
    ) {
        return null;
    }
    return utcMs;
}

function toUtcDayStartMs(input) {
    const date = new Date(input);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0);
}

function isWithinLastWeekRangeUtc(utcMs, nowMs = Date.now()) {
    const todayStartUtcMs = toUtcDayStartMs(nowMs);
    const minStartUtcMs = todayStartUtcMs - CUSTOM_EXPORT_DATE_RANGE_MS;
    return utcMs >= minStartUtcMs && utcMs <= todayStartUtcMs;
}

function toUnixMs(valueRaw) {
    const parsed = Date.parse(String(valueRaw || ""));
    if (!Number.isFinite(parsed)) return null;
    return parsed;
}

function sanitizeFileNamePart(valueRaw) {
    return String(valueRaw || "")
        .replace(/[\\/]/g, "_")
        .replace(/[\u0000-\u001f]/g, "_")
        .trim();
}

function buildPointZipPath(fileNameRaw) {
    const fileName = sanitizeFileNamePart(fileNameRaw);
    return fileName || "point.bench";
}

async function fetchAsBuffer(url, signal) {
    const response = await fetch(url, signal ? { signal } : undefined);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

function filterRowsByStartMs(rowsRaw, startMs) {
    const rows = Array.isArray(rowsRaw) ? rowsRaw : [];
    return rows.filter((row) => {
        if (startMs == null) return true;
        const createdAtMs = toUnixMs(row?.created_at);
        if (createdAtMs == null) return false;
        return createdAtMs >= startMs;
    });
}

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["GET"])) return;

    const authKey = String(req?.query?.authKey || "").trim();
    const mode = parseMode(req?.query?.mode);
    const fromDate = String(req?.query?.fromDate || "").trim();
    const bench = normalizeBench(req?.query?.bench);
    const paretoOnly = parseParetoOnly(req?.query?.paretoOnly);
    const manualSynthesisOnly = parseManualSynthesisOnly(req?.query?.manualSynthesisOnly);
    const includedStatuses = parseIncludedStatuses(req?.query?.includedStatuses);
    const progressToken = String(req?.query?.progressToken || "").trim();
    const reportProgress = (patch) => setExportProgress(progressToken, patch);
    if (!authKey) {
        res.status(401).json({ error: "Missing auth key." });
        return;
    }
    if (!bench) {
        res.status(400).json({ error: "Invalid bench filter." });
        return;
    }

    let startMs = null;
    if (mode === "from_date") {
        startMs = parseDateStartUtcMs(fromDate);
        if (startMs == null) {
            res.status(400).json({ error: "Invalid fromDate. Use YYYY-MM-DD." });
            return;
        }
        if (!isWithinLastWeekRangeUtc(startMs)) {
            res.status(400).json({ error: "fromDate must be within the last 7 days (UTC)." });
            return;
        }
    }

    await ensureCommandUploadSettingsSchema();
    await ensurePointsStatusConstraint();

    const authRes = await sql`
      select id, last_pareto_export_at, has_new_pareto
      from public.commands
      where auth_key = ${authKey}
      limit 1
    `;
    if (authRes.rows.length === 0) {
        res.status(401).json({ error: "Invalid auth key." });
        return;
    }
    const actor = authRes.rows[0];
    if (mode === "all_new") {
        startMs = toUnixMs(actor?.last_pareto_export_at) ?? DEFAULT_PARETO_EXPORT_BASELINE_UTC_MS;
    }

    try {
        const pointsRes = bench === "all"
            ? await sql`
              select benchmark, delay, area, file_name, created_at, status, manual_synthesis
              from public.points
              where benchmark <> 'test'
                and file_name is not null
                and btrim(file_name) <> ''
                and lower(coalesce(lifecycle_status, 'main')) <> 'deleted'
              order by created_at desc
            `
            : await sql`
              select benchmark, delay, area, file_name, created_at, status, manual_synthesis
              from public.points
              where benchmark = ${bench}
                and benchmark <> 'test'
                and file_name is not null
                and btrim(file_name) <> ''
                and lower(coalesce(lifecycle_status, 'main')) <> 'deleted'
              order by created_at desc
            `;
        const rowsByStatus = (Array.isArray(pointsRes.rows) ? pointsRes.rows : []).filter((row) => {
            const statusMatches = includedStatuses.includes(String(row?.status || "").trim().toLowerCase());
            if (!statusMatches) return false;
            if (!manualSynthesisOnly) return true;
            return Boolean(row?.manual_synthesis);
        });
        const paretoBaseRows = paretoOnly ? selectParetoRows(rowsByStatus) : rowsByStatus;
        const selectedRows = filterRowsByStartMs(paretoBaseRows, startMs);
        if (selectedRows.length < 1) {
            reportProgress({
                type: "pareto_export",
                status: "no_points",
                unit: "points",
                done: 0,
                total: 0,
                downloaded: 0,
                doneFlag: true,
                error: null,
            });
            if (mode === "all_new") {
                res.status(409).json({ error: "No new points to export." });
                return;
            }
            res.status(409).json({ error: "No points to export for selected filters." });
            return;
        }
        const pointRows = Array.from(
            selectedRows.reduce((acc, row) => {
                const sourceFileName = String(row?.file_name || "").trim();
                if (!sourceFileName) return acc;
                if (!acc.has(sourceFileName)) {
                    acc.set(sourceFileName, {
                        sourceFileName,
                        benchmark: String(row?.benchmark || "").trim(),
                        createdAt: row?.created_at || null,
                        manualSynthesis: Boolean(row?.manual_synthesis),
                    });
                }
                return acc;
            }, new Map()).values()
        );

        const totalPoints = pointRows.length;
        let processedPoints = 0;
        let downloadedPoints = 0;
        reportProgress({
            type: "pareto_export",
            status: "downloading_files",
            unit: "points",
            done: 0,
            total: totalPoints,
            downloaded: 0,
            doneFlag: false,
            error: null,
        });

        const downloadedFiles = [];
        let totalSchemesBytes = 0;
        for (const row of pointRows) {
            processedPoints += 1;
            const downloadUrl = buildDownloadUrl(row.sourceFileName);
            if (!downloadUrl) {
                reportProgress({
                    status: "error",
                    done: processedPoints,
                    total: totalPoints,
                    downloaded: downloadedPoints,
                    doneFlag: true,
                    error: "Download URL is not configured.",
                });
                res.status(500).json({ error: "Download URL is not configured." });
                return;
            }
            const fileBuffer = await fetchAsBuffer(downloadUrl, req?.abortSignal || null);
            if (!fileBuffer) {
                reportProgress({
                    status: "error",
                    done: processedPoints,
                    total: totalPoints,
                    downloaded: downloadedPoints,
                    doneFlag: true,
                    error: `Failed to download file: ${row.sourceFileName}`,
                });
                res.status(422).json({ error: `Failed to download file: ${row.sourceFileName}` });
                return;
            }
            totalSchemesBytes += fileBuffer.length;
            downloadedPoints += 1;
            downloadedFiles.push({
                fileName: row.sourceFileName,
                benchmark: row.benchmark,
                createdAt: row.createdAt,
                manualSynthesis: Boolean(row.manualSynthesis),
                fileBuffer,
            });
            reportProgress({
                done: processedPoints,
                total: totalPoints,
                downloaded: downloadedPoints,
            });
        }

        const chargedBytes = Math.max(0, Number(totalSchemesBytes || 0));
        const chargeRes = await sql`
          update public.commands
          set uploaded_bytes_total = uploaded_bytes_total + ${chargedBytes}::bigint,
              last_pareto_export_at = now(),
              has_new_pareto = false
          where id = ${actor.id}
            and uploaded_bytes_total + ${chargedBytes}::bigint <= total_upload_quota_bytes
          returning uploaded_bytes_total, total_upload_quota_bytes
        `;
        if (chargeRes.rows.length === 0) {
            reportProgress({
                status: "error",
                done: processedPoints,
                total: totalPoints,
                downloaded: downloadedPoints,
                doneFlag: true,
                error: "Multi-file quota exceeded.",
            });
            res.status(413).json({ error: "Multi-file quota exceeded." });
            return;
        }

        const manifest = {
            exportedAt: new Date().toISOString(),
            mode,
            fromDate: mode === "from_date" ? fromDate : null,
            startedFrom: startMs == null ? null : new Date(startMs).toISOString(),
            bench,
            paretoOnly,
            manualSynthesisOnly,
            includedStatuses,
            points: downloadedFiles.map((item) => ({
                benchmark: item.benchmark,
                fileName: item.fileName,
                createdAt: item.createdAt,
                manualSynthesis: Boolean(item.manualSynthesis),
                bytes: item.fileBuffer.length,
            })),
            totalPoints: downloadedFiles.length,
            chargedBytes,
            quota: {
                uploadedBytesTotal: Number(chargeRes.rows[0]?.uploaded_bytes_total || 0),
                totalUploadQuotaBytes: Number(chargeRes.rows[0]?.total_upload_quota_bytes || 0),
            },
        };

        const zipEntries = downloadedFiles.map((item) => ({
            name: buildPointZipPath(item.fileName),
            data: item.fileBuffer,
        }));
        zipEntries.push({
            name: "manifest.json",
            data: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
        });
        reportProgress({
            status: "building_zip",
            done: processedPoints,
            total: totalPoints,
            downloaded: downloadedPoints,
        });
        const zipBuffer = buildZipBuffer(zipEntries);
        reportProgress({
            status: "done",
            done: processedPoints,
            total: totalPoints,
            downloaded: downloadedPoints,
            doneFlag: true,
            error: null,
        });
        const fileName = buildExportFileName();
        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
        res.setHeader("Cache-Control", "no-store");
        res.end(zipBuffer);
    } catch (error) {
        reportProgress({
            status: "error",
            doneFlag: true,
            error: "Failed to export points.",
        });
        res.status(500).json({ error: "Failed to export points." });
    }
}

// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";
import fs from "node:fs/promises";
import path from "node:path";
import { rejectMethod } from "./_lib/http.js";
import { ensureCommandRolesSchema } from "./_roles.js";
import { buildDownloadUrl } from "./_lib/points.js";
import { authenticateAdmin } from "./_lib/adminUsers/utils.js";
import { buildZipBuffer } from "./_lib/zip.js";
import { setExportProgress } from "./_lib/exportProgress.js";
import { ensurePointsStatusConstraint } from "./_lib/pointsStatus.js";

const MAX_TOTAL_FILES = 5000;
const LOCAL_EXPORT_TRACK_ROOT = path.join(process.cwd(), ".local-exported-points");
const DELETED_FILE_PREFIX = "deleted_";

function buildFileName() {
    return `schemes-export-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
}

function sanitizeFileNamePart(valueRaw) {
    return String(valueRaw || "")
        .replace(/[\\/]/g, "_")
        .replace(/[\u0000-\u001f]/g, "_")
        .trim();
}

async function fetchAsBuffer(url, signal) {
    const response = await fetch(url, signal ? { signal } : undefined);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

function isLocalExportRequest(req) {
    const host = String(req?.headers?.host || "").toLowerCase();
    return host.includes("localhost") || host.includes("127.0.0.1");
}

function buildPointZipPath(fileNameRaw, benchmarkRaw) {
    const fileName = sanitizeFileNamePart(fileNameRaw);
    const benchmark = String(benchmarkRaw || "").trim();
    if (!benchmark) return `points/bench_unknown/${fileName}`;
    return `points/bench${benchmark}/${fileName}`;
}

function normalizeExportScope(rawScope) {
    const scope = String(rawScope || "").trim().toLowerCase();
    return scope === "pareto" ? "pareto" : "all";
}

function normalizeVerdictScope(rawScope) {
    const scope = String(rawScope || "").trim().toLowerCase();
    return scope === "all" ? "all" : "verify";
}

function isVerifyStatus(statusRaw) {
    const status = String(statusRaw || "").trim().toLowerCase();
    return status === "verify" || status === "verified";
}

async function saveLocalExportedFiles(scope, filesRaw) {
    const files = Array.isArray(filesRaw) ? filesRaw : [];
    if (files.length === 0) return;
    const scopeDir = path.join(LOCAL_EXPORT_TRACK_ROOT, scope);
    await fs.mkdir(scopeDir, { recursive: true });
    await Promise.all(
        files.map((item) =>
            fs.writeFile(
                path.join(scopeDir, sanitizeFileNamePart(item?.fileName)),
                Buffer.isBuffer(item?.fileBuffer) ? item.fileBuffer : Buffer.alloc(0)
            )
        )
    );
}

function applyLifecyclePrefix(fileNameRaw, lifecycleStatusRaw) {
    const fileName = sanitizeFileNamePart(fileNameRaw);
    const lifecycleStatus = String(lifecycleStatusRaw || "").trim().toLowerCase();
    if (lifecycleStatus !== "deleted") return fileName;
    if (fileName.startsWith(DELETED_FILE_PREFIX)) return fileName;
    return `${DELETED_FILE_PREFIX}${fileName}`;
}

async function removeLocalFilesByNames(scope, sourceFileNamesRaw) {
    const sourceFileNames = new Set(
        (Array.isArray(sourceFileNamesRaw) ? sourceFileNamesRaw : [])
            .map((name) => sanitizeFileNamePart(name))
            .filter(Boolean)
    );
    if (sourceFileNames.size === 0) return 0;
    const scopeDir = path.join(LOCAL_EXPORT_TRACK_ROOT, scope);
    try {
        const names = await fs.readdir(scopeDir, { withFileTypes: true });
        let removed = 0;
        for (const item of names) {
            if (!item.isFile()) continue;
            const fileName = String(item.name || "").trim();
            if (!fileName || fileName === "manifest.json") continue;
            const normalized = fileName.startsWith(DELETED_FILE_PREFIX)
                ? fileName.slice(DELETED_FILE_PREFIX.length)
                : fileName;
            if (!sourceFileNames.has(normalized)) continue;
            await fs.rm(path.join(scopeDir, fileName), { force: true });
            removed += 1;
        }
        return removed;
    } catch {
        return 0;
    }
}

function selectParetoRows(rowsRaw) {
    const rows = Array.isArray(rowsRaw) ? rowsRaw : [];
    const rowsByBenchmark = new Map();
    for (const row of rows) {
        const benchmark = String(row?.benchmark || "").trim();
        const delay = Number(row?.delay);
        const area = Number(row?.area);
        if (!benchmark || !Number.isFinite(delay) || !Number.isFinite(area)) continue;
        if (!rowsByBenchmark.has(benchmark)) rowsByBenchmark.set(benchmark, []);
        rowsByBenchmark.get(benchmark).push({
            row,
            delay: Math.trunc(delay),
            area: Number(area),
        });
    }

    const selected = [];
    for (const bucket of rowsByBenchmark.values()) {
        bucket.sort((a, b) => {
            if (a.delay !== b.delay) return a.delay - b.delay;
            return a.area - b.area;
        });
        let bestArea = Infinity;
        for (const item of bucket) {
            if (item.area < bestArea) {
                selected.push(item.row);
                bestArea = item.area;
            }
        }
    }
    return selected;
}

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["GET"])) return;

    const authKey = String(req?.query?.authKey || "").trim();
    const progressToken = String(req?.query?.progressToken || "").trim();
    const exportScope = normalizeExportScope(req?.query?.scope);
    const verdictScope = normalizeVerdictScope(req?.query?.verdictScope);
    if (!authKey) {
        res.status(400).json({ error: "Missing auth key." });
        return;
    }

    await ensureCommandRolesSchema();
    await ensurePointsStatusConstraint();

    const admin = await authenticateAdmin(authKey);
    if (!admin) {
        res.status(403).json({ error: "Admin access required." });
        return;
    }

    try {
        const pointsRes = await sql`
          select benchmark, delay, area, file_name, status, lifecycle_status
          from points
          where file_name is not null
            and btrim(file_name) <> ''
          order by id asc
        `;

        const rowsByVerdict = verdictScope === "all"
            ? pointsRes.rows
            : pointsRes.rows.filter((row) => isVerifyStatus(row?.status));
        const rowsByLifecycle = exportScope === "pareto"
            ? rowsByVerdict.filter((row) => String(row?.lifecycle_status || "").trim().toLowerCase() !== "deleted")
            : rowsByVerdict;
        const selectedRows = exportScope === "pareto"
            ? selectParetoRows(rowsByLifecycle)
            : rowsByVerdict;
        const selectedFiles = selectedRows
            .map((row) => ({
                sourceFileName: String(row.file_name || "").trim(),
                exportFileName: applyLifecyclePrefix(row.file_name, row.lifecycle_status),
                benchmark: String(row.benchmark || "").trim(),
            }))
            .filter((row) => row.sourceFileName && row.exportFileName);
        const localExportMode = isLocalExportRequest(req);
        const pointFiles = Array.from(
            selectedFiles.reduce((acc, row) => {
                const key = `${row.exportFileName}::${row.sourceFileName}`;
                if (!acc.has(key)) acc.set(key, row);
                return acc;
            }, new Map()).values()
        ).slice(0, MAX_TOTAL_FILES);

        const totalFiles = pointFiles.length;
        let processedFiles = 0;
        setExportProgress(progressToken, {
            type: "schemes_zip",
            status: "downloading_files",
            unit: "files",
            scope: exportScope,
            verdictScope,
            done: processedFiles,
            total: totalFiles,
            doneFlag: false,
            error: null,
        });

        const downloadedFiles = [];
        const errors = [];
        const downloadConcurrency = localExportMode ? 8 : 1;
        async function processPointFile(fileMeta) {
            if (req?.abortSignal?.aborted) {
                return { aborted: true };
            }
            const sourceFileName = String(fileMeta?.sourceFileName || "").trim();
            const exportFileName = String(fileMeta?.exportFileName || "").trim();
            const benchmark = String(fileMeta?.benchmark || "").trim();
            const downloadUrl = buildDownloadUrl(sourceFileName);
            if (!downloadUrl) {
                return {
                    ok: false,
                    error: { type: "point", fileName: sourceFileName, reason: "Download URL is not configured." },
                };
            }
            const fileBuffer = await fetchAsBuffer(downloadUrl, req?.abortSignal || null);
            if (!fileBuffer) {
                return {
                    ok: false,
                    error: { type: "point", fileName: sourceFileName, reason: "Failed to download file." },
                };
            }
            return {
                ok: true,
                item: {
                    fileName: exportFileName,
                    name: buildPointZipPath(exportFileName, benchmark),
                    fileBuffer,
                },
            };
        }

        let cursor = 0;
        const workers = Array.from({ length: Math.max(1, Math.min(downloadConcurrency, pointFiles.length || 1)) }, () =>
            (async () => {
                while (cursor < pointFiles.length) {
                    const idx = cursor;
                    cursor += 1;
                    const fileMeta = pointFiles[idx];
                    const result = await processPointFile(fileMeta);
                    if (result?.aborted) return;
                    if (result?.ok && result.item) {
                        downloadedFiles.push(result.item);
                    } else if (result?.error) {
                        errors.push(result.error);
                    }
                    processedFiles += 1;
                    setExportProgress(progressToken, { done: processedFiles });
                }
            })()
        );
        await Promise.all(workers);

        if (req?.abortSignal?.aborted) {
            setExportProgress(progressToken, {
                status: "cancelled",
                doneFlag: true,
                done: processedFiles,
            });
            return;
        }

        const manifest = {
            exportedAt: new Date().toISOString(),
            exportedByCommandId: Number(admin.id),
            maxTotalFiles: MAX_TOTAL_FILES,
            included: {
                points: pointFiles.length,
            },
            archivedEntries: downloadedFiles.length,
            errors,
            mode: {
                local: localExportMode,
                downloadConcurrency,
                scope: exportScope,
                verdictScope,
            },
        };
        if (localExportMode) {
            setExportProgress(progressToken, {
                status: "saving_files",
                done: processedFiles,
                total: totalFiles,
            });
            await saveLocalExportedFiles(exportScope, downloadedFiles);
            if (exportScope === "pareto") {
                const deletedSourceFiles = pointsRes.rows
                    .filter((row) => String(row?.lifecycle_status || "").trim().toLowerCase() === "deleted")
                    .map((row) => String(row?.file_name || "").trim())
                    .filter(Boolean);
                if (deletedSourceFiles.length > 0) {
                    setExportProgress(progressToken, {
                        status: "cleaning_files",
                        done: processedFiles,
                        total: totalFiles,
                    });
                    await removeLocalFilesByNames(exportScope, deletedSourceFiles);
                }
            }
            await fs.writeFile(
                path.join(LOCAL_EXPORT_TRACK_ROOT, exportScope, "manifest.json"),
                `${JSON.stringify(manifest, null, 2)}\n`,
                "utf8"
            );
            setExportProgress(progressToken, {
                status: "done",
                doneFlag: true,
                done: processedFiles,
                total: totalFiles,
            });
            res.status(200).json({
                ok: true,
                mode: "local_files",
                exportDir: path.join(LOCAL_EXPORT_TRACK_ROOT, exportScope),
                savedFiles: downloadedFiles.length,
                errors,
            });
            return;
        }
        const zipEntries = downloadedFiles.map((item) => ({ name: item.name, data: item.fileBuffer }));
        zipEntries.push({
            name: "manifest.json",
            data: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
        });
        const fileName = buildFileName();
        setExportProgress(progressToken, {
            status: "building_zip",
            done: processedFiles,
            total: totalFiles,
        });
        const zipBuffer = buildZipBuffer(zipEntries);
        setExportProgress(progressToken, {
            status: "done",
            doneFlag: true,
            done: processedFiles,
            total: totalFiles,
        });
        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
        res.setHeader("Cache-Control", "no-store");
        res.end(zipBuffer);
    } catch (error) {
        const aborted = req?.abortSignal?.aborted || String(error?.name || "").toLowerCase() === "aborterror";
        setExportProgress(progressToken, {
            status: aborted ? "cancelled" : "error",
            doneFlag: true,
            error: aborted ? null : "Failed to build schemes archive.",
        });
        if (aborted) return;
        res.status(500).json({ error: "Failed to build schemes archive." });
    }
}

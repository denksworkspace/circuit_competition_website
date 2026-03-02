// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";
import { rejectMethod } from "./_lib/http.js";
import { ensureCommandRolesSchema } from "./_roles.js";
import { buildDownloadUrl, parseStoredBenchFileName } from "./_lib/points.js";
import { authenticateAdmin } from "./_lib/adminUsers/utils.js";
import { buildZipBuffer } from "./_lib/zip.js";
import { setExportProgress } from "./_lib/exportProgress.js";

const MAX_TOTAL_FILES = 5000;

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

function buildPointZipPath(fileNameRaw) {
    const fileName = sanitizeFileNamePart(fileNameRaw);
    const parsed = parseStoredBenchFileName(fileName);
    if (!parsed?.ok) return `points/bench_unknown/${fileName}`;
    return `points/bench${parsed.benchmark}/${fileName}`;
}

function normalizeExportScope(rawScope) {
    const scope = String(rawScope || "").trim().toLowerCase();
    return scope === "pareto" ? "pareto" : "all";
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
    if (!authKey) {
        res.status(400).json({ error: "Missing auth key." });
        return;
    }

    await ensureCommandRolesSchema();

    const admin = await authenticateAdmin(authKey);
    if (!admin) {
        res.status(403).json({ error: "Admin access required." });
        return;
    }

    try {
        const pointsRes = await sql`
          select benchmark, delay, area, file_name
          from points
          where file_name is not null
            and btrim(file_name) <> ''
          order by id asc
        `;

        const selectedRows = exportScope === "pareto"
            ? selectParetoRows(pointsRes.rows)
            : pointsRes.rows;
        const pointFiles = selectedRows
            .map((row) => String(row.file_name || "").trim())
            .filter(Boolean)
            .slice(0, MAX_TOTAL_FILES);

        const totalFiles = pointFiles.length;
        let processedFiles = 0;
        setExportProgress(progressToken, {
            type: "schemes_zip",
            status: "downloading_files",
            unit: "files",
            scope: exportScope,
            done: processedFiles,
            total: totalFiles,
            doneFlag: false,
            error: null,
        });

        const zipEntries = [];
        const errors = [];
        const downloadConcurrency = isLocalExportRequest(req) ? 8 : 1;

        async function processPointFile(fileName) {
            if (req?.abortSignal?.aborted) {
                return { aborted: true };
            }
            const downloadUrl = buildDownloadUrl(fileName);
            if (!downloadUrl) {
                return {
                    ok: false,
                    error: { type: "point", fileName, reason: "Download URL is not configured." },
                };
            }
            const fileBuffer = await fetchAsBuffer(downloadUrl, req?.abortSignal || null);
            if (!fileBuffer) {
                return {
                    ok: false,
                    error: { type: "point", fileName, reason: "Failed to download file." },
                };
            }
            return {
                ok: true,
                entry: {
                    name: buildPointZipPath(fileName),
                    data: fileBuffer,
                },
            };
        }

        let cursor = 0;
        const workers = Array.from({ length: Math.max(1, Math.min(downloadConcurrency, pointFiles.length || 1)) }, () =>
            (async () => {
                while (cursor < pointFiles.length) {
                    const idx = cursor;
                    cursor += 1;
                    const fileName = pointFiles[idx];
                    const result = await processPointFile(fileName);
                    if (result?.aborted) return;
                    if (result?.ok && result.entry) {
                        zipEntries.push(result.entry);
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
            archivedEntries: zipEntries.length,
            errors,
            mode: {
                local: isLocalExportRequest(req),
                downloadConcurrency,
                scope: exportScope,
            },
        };
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

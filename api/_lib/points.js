// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
/* global process */

const BENCH_STORED_NAME_RE = /^bench(2\d\d)_(\d+)_(\d+)_([A-Za-z0-9-]+)_([A-Za-z0-9-]+)\.bench$/;

function normalizeCloudFrontDomain(raw) {
    const trimmed = String(raw || "").trim();
    if (!trimmed) return "";
    return trimmed.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

const cloudFrontDomain = normalizeCloudFrontDomain(process.env.CLOUDFRONT_DOMAIN);

export function buildObjectKey(fileName) {
    return `points/${fileName}`;
}

export function buildDownloadUrl(fileName) {
    if (!cloudFrontDomain || !fileName) return null;
    const encodedKey = buildObjectKey(fileName)
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");

    return `https://${cloudFrontDomain}/${encodedKey}`;
}

export function normalizePointRow(row) {
    return {
        id: row.id,
        benchmark: row.benchmark,
        delay: Number(row.delay),
        area: Number(row.area),
        description: row.description,
        sender: row.sender,
        fileName: row.file_name,
        status: row.status,
        checkerVersion: row.checker_version ?? null,
        fileKey: buildObjectKey(row.file_name),
        downloadUrl: buildDownloadUrl(row.file_name),
    };
}

export function parseStoredBenchFileName(fileNameRaw) {
    const fileName = String(fileNameRaw || "").trim();
    if (!fileName) return { ok: false, error: "Empty file name." };

    const match = fileName.match(BENCH_STORED_NAME_RE);
    if (!match) {
        return {
            ok: false,
            error: "Invalid generated file name. Expected: bench{200..299}_<delay>_<area>_<command>_<point_id>.bench",
        };
    }

    return {
        ok: true,
        fileName,
        benchmark: String(Number(match[1])),
        delay: Number(match[2]),
        area: Number(match[3]),
    };
}

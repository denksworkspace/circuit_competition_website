// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";
import { buildPresignedPutUrl } from "./s3Presign.js";
import { selectParetoRows } from "./pareto.js";
import { ensurePointsStatusConstraint } from "./pointsStatus.js";

export const PARETO_FILENAMES_PREFIX = "pareto_filenames";
export const VERIFIED_PARETO_OBJECT_KEY = `${PARETO_FILENAMES_PREFIX}/verified_pareto_filenames.csv`;
export const NON_VERIFIED_PARETO_OBJECT_KEY = `${PARETO_FILENAMES_PREFIX}/non_verified_pareto_filenames.csv`;

const STATUS_TO_OBJECT_KEY = new Map([
    ["verified", VERIFIED_PARETO_OBJECT_KEY],
    ["non-verified", NON_VERIFIED_PARETO_OBJECT_KEY],
]);

function normalizeTrackedStatuses(statusesRaw) {
    const items = Array.isArray(statusesRaw) ? statusesRaw : [statusesRaw];
    return Array.from(
        new Set(
            items
                .map((status) => String(status || "").trim().toLowerCase())
                .filter((status) => STATUS_TO_OBJECT_KEY.has(status))
        )
    );
}

function buildCsvBody(fileNames) {
    const rows = (Array.isArray(fileNames) ? fileNames : [])
        .map((name) => String(name || "").trim())
        .filter(Boolean)
        .sort((lhs, rhs) => lhs.localeCompare(rhs));
    if (rows.length < 1) return "";
    return `${rows.join("\n")}\n`;
}

function readAwsConfig() {
    return {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN,
        region: process.env.AWS_REGION,
        bucket: process.env.S3_BUCKET,
    };
}

function ensureAwsConfig() {
    const config = readAwsConfig();
    if (!config.accessKeyId || !config.secretAccessKey || !config.region || !config.bucket) {
        throw new Error("S3 configuration is not complete.");
    }
    return config;
}

async function fetchParetoFileNamesByStatus(status) {
    await ensurePointsStatusConstraint();
    const statusNormalized = String(status || "").trim().toLowerCase();
    const pointsRes = await sql`
      select benchmark, delay, area, file_name, created_at
      from points
      where benchmark <> 'test'
        and file_name is not null
        and btrim(file_name) <> ''
        and lower(coalesce(lifecycle_status, 'main')) <> 'deleted'
        and lower(coalesce(status, '')) = ${statusNormalized}
      order by created_at desc
    `;
    const paretoRows = selectParetoRows(pointsRes.rows);
    return Array.from(
        paretoRows.reduce((acc, row) => {
            const fileName = String(row?.file_name || "").trim();
            if (!fileName) return acc;
            acc.add(fileName);
            return acc;
        }, new Set())
    );
}

async function uploadCsvBody({ objectKey, body }) {
    const { accessKeyId, secretAccessKey, sessionToken, region, bucket } = ensureAwsConfig();
    const uploadUrl = buildPresignedPutUrl({
        bucket,
        region,
        accessKeyId,
        secretAccessKey,
        sessionToken,
        objectKey,
        expiresSeconds: 900,
    });
    const response = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
            "content-type": "text/csv; charset=utf-8",
        },
        body,
    });
    if (!response.ok) {
        throw new Error(`Failed to upload pareto filenames CSV: ${objectKey}`);
    }
}

export async function syncParetoFilenameCsvs({ statuses } = {}) {
    const trackedStatuses = normalizeTrackedStatuses(statuses);
    for (const status of trackedStatuses) {
        const objectKey = STATUS_TO_OBJECT_KEY.get(status);
        const fileNames = await fetchParetoFileNamesByStatus(status);
        await uploadCsvBody({
            objectKey,
            body: buildCsvBody(fileNames),
        });
    }
}


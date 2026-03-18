// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { buildPresignedDeleteUrl, buildPresignedPutUrl } from "./s3Presign.js";

function sanitizeToken(raw) {
    return (
        String(raw || "")
            .trim()
            .replace(/[^A-Za-z0-9._-]+/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "") || "x"
    );
}

function normalizeCloudFrontDomain(raw) {
    const trimmed = String(raw || "").trim();
    if (!trimmed) return "";
    return trimmed.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

function readAwsConfig() {
    return {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN,
        region: process.env.AWS_REGION,
    };
}

export function getQueueBucketName() {
    return String(process.env.QUEUE_S3_BUCKET || "").trim();
}

export function getQueuePrefix() {
    const value = String(process.env.QUEUE_S3_PREFIX || "queue").trim().replace(/^\/+|\/+$/g, "");
    return value || "queue";
}

export function buildQueueObjectKey({ requestId, fileId, originalFileName }) {
    const prefix = getQueuePrefix();
    const safeRequestId = sanitizeToken(requestId);
    const safeFileId = sanitizeToken(fileId);
    const safeName = sanitizeToken(originalFileName || "file.bench");
    return `${prefix}/${safeRequestId}/${safeFileId}_${safeName}`;
}

export function buildQueueDownloadUrl(objectKey) {
    const domain = normalizeCloudFrontDomain(process.env.QUEUE_CLOUDFRONT_DOMAIN || process.env.CLOUDFRONT_DOMAIN);
    if (!domain) return null;
    const encoded = String(objectKey || "")
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");
    return `https://${domain}/${encoded}`;
}

export function buildQueueUploadUrl(objectKey, expiresSeconds = 900) {
    const { accessKeyId, secretAccessKey, sessionToken, region } = readAwsConfig();
    const bucket = getQueueBucketName();
    if (!accessKeyId || !secretAccessKey || !region || !bucket) return null;
    return buildPresignedPutUrl({
        bucket,
        region,
        accessKeyId,
        secretAccessKey,
        sessionToken,
        objectKey,
        expiresSeconds,
    });
}

export async function deleteQueueObject(objectKey) {
    const { accessKeyId, secretAccessKey, sessionToken, region } = readAwsConfig();
    const bucket = getQueueBucketName();
    if (!accessKeyId || !secretAccessKey || !region || !bucket || !objectKey) return;
    const url = buildPresignedDeleteUrl({
        bucket,
        region,
        accessKeyId,
        secretAccessKey,
        sessionToken,
        objectKey,
        expiresSeconds: 900,
    });
    try {
        await fetch(url, { method: "DELETE" });
    } catch {
        // best-effort cleanup
    }
}

export async function downloadQueueFileText(objectKey, { signal = null } = {}) {
    const downloadUrl = buildQueueDownloadUrl(objectKey);
    if (!downloadUrl) {
        return { ok: false, reason: "Queue CloudFront URL is not configured." };
    }
    try {
        const response = await fetch(downloadUrl, signal ? { signal } : undefined);
        if (!response.ok) {
            return { ok: false, reason: "Failed to download queue file." };
        }
        return { ok: true, circuitText: await response.text() };
    } catch (error) {
        if (error?.name === "AbortError" || error?.code === "ABORT_ERR" || signal?.aborted) {
            return { ok: false, aborted: true, reason: "Queue file download was aborted." };
        }
        return { ok: false, reason: String(error?.message || "Failed to download queue file.") };
    }
}

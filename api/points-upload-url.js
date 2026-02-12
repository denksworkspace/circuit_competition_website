/* global process */
import crypto from "node:crypto";
import { sql } from "@vercel/postgres";
import { normalizeRole, ROLE_ADMIN, ensureCommandRolesSchema } from "./_roles.js";

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
const MAX_ADMIN_UPLOAD_BYTES = 50 * 1024 * 1024 * 1024;
const BENCH_NAME_RE = /^bench(2\d\d)_(\d+)_(\d+)_([A-Za-z0-9-]+)_([A-Za-z0-9-]+)\.bench$/;

function parseBody(req) {
    if (req.body && typeof req.body === "object") return req.body;
    if (!req.body) return {};
    try {
        return JSON.parse(req.body);
    } catch {
        return {};
    }
}

function hmac(key, data, encoding) {
    return crypto.createHmac("sha256", key).update(data, "utf8").digest(encoding);
}

function sha256Hex(data) {
    return crypto.createHash("sha256").update(data, "utf8").digest("hex");
}

function encodeRfc3986(value) {
    return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function buildCanonicalUri(objectKey) {
    return `/${String(objectKey)
        .split("/")
        .map((segment) => encodeRfc3986(segment))
        .join("/")}`;
}

function toAmzDate(now = new Date()) {
    const iso = now.toISOString();
    const shortDate = iso.slice(0, 10).replace(/-/g, "");
    const amzDate = `${shortDate}T${iso.slice(11, 19).replace(/:/g, "")}Z`;
    return { shortDate, amzDate };
}

function getSigningKey(secretAccessKey, shortDate, region, service) {
    const kDate = hmac(`AWS4${secretAccessKey}`, shortDate);
    const kRegion = hmac(kDate, region);
    const kService = hmac(kRegion, service);
    return hmac(kService, "aws4_request");
}

function parseBenchFileName(fileNameRaw) {
    const fileName = String(fileNameRaw || "").trim();
    if (!fileName) return { ok: false, error: "Empty file name." };
    const m = fileName.match(BENCH_NAME_RE);
    if (!m) {
        return {
            ok: false,
            error:
                "Invalid generated file name. Expected: bench{200..299}_<delay>_<area>_<command>_<point_id>.bench",
        };
    }
    return {
        ok: true,
        fileName,
        benchmark: String(Number(m[1])),
        delay: Number(m[2]),
        area: Number(m[3]),
    };
}

function buildObjectKey(fileName) {
    return `points/${fileName}`;
}

function buildPresignedPutUrl({
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
    sessionToken,
    objectKey,
    expiresSeconds,
}) {
    const service = "s3";
    const { shortDate, amzDate } = toAmzDate();
    const host = `${bucket}.s3.${region}.amazonaws.com`;
    const canonicalUri = buildCanonicalUri(objectKey);

    const credentialScope = `${shortDate}/${region}/${service}/aws4_request`;
    const signedHeaders = "host";

    const query = {
        "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
        "X-Amz-Credential": `${accessKeyId}/${credentialScope}`,
        "X-Amz-Date": amzDate,
        "X-Amz-Expires": String(expiresSeconds),
        "X-Amz-SignedHeaders": signedHeaders,
    };

    if (sessionToken) {
        query["X-Amz-Security-Token"] = sessionToken;
    }

    const canonicalQueryString = Object.keys(query)
        .sort()
        .map((k) => `${encodeRfc3986(k)}=${encodeRfc3986(query[k])}`)
        .join("&");

    const canonicalHeaders = `host:${host}\n`;
    const payloadHash = "UNSIGNED-PAYLOAD";

    const canonicalRequest = [
        "PUT",
        canonicalUri,
        canonicalQueryString,
        canonicalHeaders,
        signedHeaders,
        payloadHash,
    ].join("\n");

    const stringToSign = [
        "AWS4-HMAC-SHA256",
        amzDate,
        credentialScope,
        sha256Hex(canonicalRequest),
    ].join("\n");

    const signingKey = getSigningKey(secretAccessKey, shortDate, region, service);
    const signature = hmac(signingKey, stringToSign, "hex");

    const finalQuery = `${canonicalQueryString}&X-Amz-Signature=${signature}`;
    return `https://${host}${canonicalUri}?${finalQuery}`;
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        res.status(405).end();
        return;
    }

    const body = parseBody(req);
    const { authKey, fileName, fileSize } = body || {};

    if (!authKey) {
        res.status(401).json({ error: "Missing auth key." });
        return;
    }

    const parsed = parseBenchFileName(fileName);
    if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
    }

    if (typeof fileSize !== "number" || !Number.isFinite(fileSize) || fileSize < 0) {
        res.status(400).json({ error: "Invalid file size." });
        return;
    }

    await ensureCommandRolesSchema();
    const cmdRes = await sql`select id, name, role from commands where auth_key = ${authKey}`;
    if (cmdRes.rows.length === 0) {
        res.status(401).json({ error: "Invalid auth key." });
        return;
    }
    const command = cmdRes.rows[0];
    const role = normalizeRole(command.role);
    const maxBytes = role === ROLE_ADMIN ? MAX_ADMIN_UPLOAD_BYTES : MAX_UPLOAD_BYTES;

    if (fileSize > maxBytes) {
        if (role === ROLE_ADMIN) {
            res.status(413).json({ error: "File is too large. Maximum size is 50 GB for admin." });
            return;
        }
        res.status(413).json({ error: "File is too large. Maximum size is 500 MB." });
        return;
    }

    const duplicate = await sql`
      select id
      from points
      where command_id = ${command.id}
        and benchmark = ${parsed.benchmark}
        and delay = ${parsed.delay}
        and area = ${parsed.area}
      limit 1
    `;
    if (duplicate.rows.length > 0) {
        res.status(409).json({
            error: "Point with the same benchmark, delay, and area already exists for this user.",
        });
        return;
    }

    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const region = process.env.AWS_REGION;
    const bucket = process.env.S3_BUCKET;
    const sessionToken = process.env.AWS_SESSION_TOKEN;

    if (!accessKeyId || !secretAccessKey || !region || !bucket) {
        res.status(500).json({ error: "S3 configuration is not complete." });
        return;
    }

    const objectKey = buildObjectKey(parsed.fileName);
    const uploadUrl = buildPresignedPutUrl({
        bucket,
        region,
        accessKeyId,
        secretAccessKey,
        sessionToken,
        objectKey,
        expiresSeconds: 900,
    });

    res.status(200).json({
        uploadUrl,
        fileKey: objectKey,
        method: "PUT",
        maxBytes,
    });
}

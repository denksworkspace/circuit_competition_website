import crypto from "node:crypto";

function hmac(key, data, encoding) {
    return crypto.createHmac("sha256", key).update(data, "utf8").digest(encoding);
}

function sha256Hex(data) {
    return crypto.createHash("sha256").update(data, "utf8").digest("hex");
}

function encodeRfc3986(value) {
    return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
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

export function buildPresignedPutUrl({
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
        .map((key) => `${encodeRfc3986(key)}=${encodeRfc3986(query[key])}`)
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

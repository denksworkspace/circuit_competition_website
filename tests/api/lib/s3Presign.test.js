// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { describe, expect, it } from "vitest";
import { buildPresignedPutUrl } from "../../../api/_lib/s3Presign.js";

describe("api/_lib/s3Presign", () => {
    it("builds AWS SigV4 PUT url with required query params", () => {
        const url = buildPresignedPutUrl({
            bucket: "my-bucket",
            region: "us-east-1",
            accessKeyId: "AKIA_TEST",
            secretAccessKey: "SECRET_TEST",
            sessionToken: "TOKEN_TEST",
            objectKey: "points/a b.bench",
            expiresSeconds: 900,
        });

        expect(url.startsWith("https://my-bucket.s3.us-east-1.amazonaws.com/points/a%20b.bench?")).toBe(true);
        expect(url).toContain("X-Amz-Algorithm=AWS4-HMAC-SHA256");
        expect(url).toContain("X-Amz-SignedHeaders=host");
        expect(url).toContain("X-Amz-Security-Token=TOKEN_TEST");
        expect(url).toContain("X-Amz-Signature=");
    });

    it("omits session token when not provided", () => {
        const url = buildPresignedPutUrl({
            bucket: "my-bucket",
            region: "us-east-1",
            accessKeyId: "AKIA_TEST",
            secretAccessKey: "SECRET_TEST",
            objectKey: "points/file.bench",
            expiresSeconds: 60,
        });

        expect(url).not.toContain("X-Amz-Security-Token=");
    });
});

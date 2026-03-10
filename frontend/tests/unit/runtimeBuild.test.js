import { describe, expect, it } from "vitest";
import { FRONTEND_BUILD_TS, withRuntimeBuildHeader } from "../../src/services/http/runtimeBuild.js";

describe("runtime build header", () => {
    it("attaches frontend build timestamp for api requests", () => {
        const [input, init] = withRuntimeBuildHeader("/api/commands", {
            headers: { "Content-Type": "application/json" },
        });
        expect(input).toBe("/api/commands");
        const headers = new Headers(init?.headers || {});
        if (FRONTEND_BUILD_TS > 0) {
            expect(headers.get("x-frontend-build-ts")).toBe(String(FRONTEND_BUILD_TS));
        } else {
            expect(headers.get("x-frontend-build-ts")).toBeNull();
        }
    });

    it("does not attach frontend build timestamp for non-api requests", () => {
        const [, init] = withRuntimeBuildHeader("https://s3.example/upload", {
            headers: { "Content-Type": "application/octet-stream" },
        });
        const headers = new Headers(init?.headers || {});
        expect(headers.get("x-frontend-build-ts")).toBeNull();
    });
});

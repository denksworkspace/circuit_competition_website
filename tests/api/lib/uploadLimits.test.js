import { describe, expect, it } from "vitest";
import {
    maxUploadBytesByRole,
    MAX_ADMIN_UPLOAD_BYTES,
    MAX_UPLOAD_BYTES,
    MAX_MULTI_FILE_BATCH_COUNT,
    uploadSizeErrorByRole,
} from "../../../api/_lib/uploadLimits.js";

describe("api/_lib/uploadLimits", () => {
    it("returns correct limits by role", () => {
        expect(maxUploadBytesByRole("admin")).toBe(MAX_ADMIN_UPLOAD_BYTES);
        expect(maxUploadBytesByRole("leader")).toBe(MAX_UPLOAD_BYTES);
        expect(maxUploadBytesByRole("participant")).toBe(MAX_UPLOAD_BYTES);
    });

    it("returns role-specific error messages", () => {
        expect(uploadSizeErrorByRole("admin")).toContain("50 GB");
        expect(uploadSizeErrorByRole("participant")).toContain("500 MB");
    });

    it("defines multi-file batch item limit", () => {
        expect(MAX_MULTI_FILE_BATCH_COUNT).toBe(100);
    });
});

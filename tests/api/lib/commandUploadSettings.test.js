import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vercel/postgres", () => ({ sql: vi.fn() }));

import { sql } from "@vercel/postgres";

async function importSettingsModule() {
    vi.resetModules();
    return import("../../../api/_lib/commandUploadSettings.js");
}

describe("api/_lib/commandUploadSettings", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("normalizes command upload settings and computes remaining", async () => {
        const mod = await importSettingsModule();
        const out = mod.normalizeCommandUploadSettings({
            role: "leader",
            max_single_upload_bytes: 1024,
            total_upload_quota_bytes: 4096,
            uploaded_bytes_total: 1000,
        });

        expect(out.maxSingleUploadBytes).toBe(1024);
        expect(out.totalUploadQuotaBytes).toBe(4096);
        expect(out.uploadedBytesTotal).toBe(1000);
        expect(out.remainingUploadBytes).toBe(3096);
    });

    it("falls back to defaults on invalid numbers", async () => {
        const mod = await importSettingsModule();
        const out = mod.normalizeCommandUploadSettings({ role: "participant" });
        expect(out.maxSingleUploadBytes).toBeGreaterThan(0);
        expect(out.totalUploadQuotaBytes).toBeGreaterThan(0);
        expect(out.remainingUploadBytes).toBe(out.totalUploadQuotaBytes);
    });

    it("ensures schema once", async () => {
        sql.mockResolvedValue({ rows: [] });
        const mod = await importSettingsModule();

        await mod.ensureCommandUploadSettingsSchema();
        await mod.ensureCommandUploadSettingsSchema();

        expect(sql).toHaveBeenCalledTimes(9);
    });
});

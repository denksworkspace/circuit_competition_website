// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vercel/postgres", () => ({ sql: vi.fn() }));

import { sql } from "@vercel/postgres";

async function importRolesModule() {
    vi.resetModules();
    return import("../../api/_roles.js");
}

describe("api/_roles", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("normalizeRole returns participant for invalid values", async () => {
        const roles = await importRolesModule();
        expect(roles.normalizeRole("admin")).toBe("admin");
        expect(roles.normalizeRole("LEADER")).toBe("leader");
        expect(roles.normalizeRole("unknown")).toBe("participant");
    });

    it("ensureCommandRolesSchema runs migration queries once", async () => {
        sql.mockResolvedValue({ rows: [] });
        const roles = await importRolesModule();

        await roles.ensureCommandRolesSchema();
        await roles.ensureCommandRolesSchema();

        expect(sql).toHaveBeenCalledTimes(3);
    });

    it("ensureCommandRolesSchema resets cache when migration fails", async () => {
        sql.mockRejectedValueOnce(new Error("db down"));
        const roles = await importRolesModule();

        await expect(roles.ensureCommandRolesSchema()).rejects.toThrow("db down");

        sql.mockResolvedValue({ rows: [] });
        await expect(roles.ensureCommandRolesSchema()).resolves.toBeUndefined();
    });
});

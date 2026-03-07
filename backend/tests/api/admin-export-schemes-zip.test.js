// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockRes } from "../helpers/mockHttp.js";

vi.mock("@vercel/postgres", () => ({ sql: vi.fn() }));
vi.mock("../../api/_roles.js", () => ({ ensureCommandRolesSchema: vi.fn() }));
vi.mock("../../api/_lib/adminUsers/utils.js", () => ({ authenticateAdmin: vi.fn() }));
vi.mock("../../api/_lib/points.js", () => ({
    buildDownloadUrl: vi.fn((fileName) => `https://points.example/${fileName}`),
    parseStoredBenchFileName: vi.fn((fileName) => ({
        ok: true,
        fileName,
        benchmark: "200",
        delay: 1,
        area: 1,
    })),
}));
vi.mock("../../api/_lib/zip.js", () => ({
    buildZipBuffer: vi.fn(() => Buffer.from("zip")),
}));
vi.mock("node:fs/promises", () => ({
    default: {
        readdir: vi.fn(),
        mkdir: vi.fn(),
        writeFile: vi.fn(),
        rm: vi.fn(),
        rename: vi.fn(),
    },
}));

import { sql } from "@vercel/postgres";
import fs from "node:fs/promises";
import { authenticateAdmin } from "../../api/_lib/adminUsers/utils.js";
import handler from "../../api/admin-export-schemes-zip.js";

describe("api/admin-export-schemes-zip handler", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        fs.readdir.mockResolvedValue([]);
        fs.mkdir.mockResolvedValue(undefined);
        fs.writeFile.mockResolvedValue(undefined);
        fs.rm.mockResolvedValue(undefined);
        fs.rename.mockResolvedValue(undefined);
        global.fetch = vi.fn(async () => ({
            ok: true,
            arrayBuffer: async () => Uint8Array.from([102, 105, 108, 101]).buffer,
        }));
    });

    it("rejects non-GET method", async () => {
        const req = { method: "POST", query: {} };
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(405);
    });

    it("requires auth key", async () => {
        const req = { method: "GET", query: {} };
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(400);
    });

    it("requires admin access", async () => {
        authenticateAdmin.mockResolvedValueOnce(null);
        const req = { method: "GET", query: { authKey: "k" }, headers: { host: "localhost:3000" } };
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(403);
    });

    it("returns schemes archive", async () => {
        authenticateAdmin.mockResolvedValueOnce({ id: 99 });
        sql.mockResolvedValueOnce({ rows: [{ file_name: "bench200_1_1_a_b.bench" }] });

        const req = { method: "GET", query: { authKey: "k" } };
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.headers["Content-Type"]).toBe("application/zip");
        expect(res.headers["Content-Disposition"]).toContain("attachment;");
        expect(res.ended).toBe(true);
    });

    it("keeps only current pareto-front files in local pareto export", async () => {
        authenticateAdmin.mockResolvedValueOnce({ id: 99 });
        sql.mockResolvedValueOnce({
            rows: [
                { benchmark: "200", delay: 1, area: 1, file_name: "bench200_1_1_keep.bench", status: "verified" },
                { benchmark: "200", delay: 2, area: 2, file_name: "bench200_2_2_drop.bench", status: "verified" },
                { benchmark: "201", delay: 5, area: 7, file_name: "bench201_5_7_keep2.bench", status: "verified" },
            ],
        });
        fs.readdir
            .mockResolvedValueOnce([
                { isFile: () => true, name: "bench200_1_1_keep.bench" },
                { isFile: () => true, name: "bench200_2_2_drop.bench" },
                { isFile: () => true, name: "bench201_5_7_keep2.bench" },
                { isFile: () => true, name: "bench333_9_9_old.bench" },
            ])
            .mockResolvedValueOnce([
                { isFile: () => true, name: "bench200_1_1_keep.bench" },
                { isFile: () => true, name: "bench200_2_2_drop.bench" },
                { isFile: () => true, name: "bench201_5_7_keep2.bench" },
                { isFile: () => true, name: "bench333_9_9_old.bench" },
                { isFile: () => true, name: "manifest.json" },
            ]);

        const req = {
            method: "GET",
            query: { authKey: "k", scope: "pareto" },
            headers: { host: "localhost:3000" },
        };
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.mode).toBe("local_files");
        expect(res.body.removedOutdatedParetoFiles).toBe(2);
        expect(fs.rm).toHaveBeenCalledTimes(2);
        const removedTargets = fs.rm.mock.calls.map((args) => String(args[0]));
        expect(removedTargets.some((target) => target.includes("bench200_2_2_drop.bench"))).toBe(true);
        expect(removedTargets.some((target) => target.includes("bench333_9_9_old.bench"))).toBe(true);
        expect(removedTargets.some((target) => target.includes("bench200_1_1_keep.bench"))).toBe(false);
        expect(removedTargets.some((target) => target.includes("bench201_5_7_keep2.bench"))).toBe(false);
    });

    it("marks outdated files as deleted in local all export", async () => {
        authenticateAdmin.mockResolvedValueOnce({ id: 99 });
        sql.mockResolvedValueOnce({
            rows: [
                { benchmark: "200", delay: 1, area: 1, file_name: "bench200_1_1_keep.bench", status: "verified" },
            ],
        });
        fs.readdir
            .mockResolvedValueOnce([
                { isFile: () => true, name: "bench200_1_1_keep.bench" },
                { isFile: () => true, name: "bench200_2_2_old.bench" },
                { isFile: () => true, name: "manifest.json" },
            ])
            .mockResolvedValueOnce([
                { isFile: () => true, name: "bench200_1_1_keep.bench" },
                { isFile: () => true, name: "bench200_2_2_old.bench" },
                { isFile: () => true, name: "manifest.json" },
            ]);

        const req = {
            method: "GET",
            query: { authKey: "k", scope: "all" },
            headers: { host: "localhost:3000" },
        };
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.mode).toBe("local_files");
        expect(res.body.renamedDeletedFiles).toBe(1);
        expect(fs.rename).toHaveBeenCalledTimes(1);
        expect(String(fs.rename.mock.calls[0][0])).toContain("bench200_2_2_old.bench");
        expect(String(fs.rename.mock.calls[0][1])).toContain("deleted_bench200_2_2_old.bench");
        expect(fs.rm).not.toHaveBeenCalled();
    });

    it("never removes files directly for local all exports across requests", async () => {
        authenticateAdmin.mockResolvedValue({ id: 99 });
        sql.mockResolvedValue({
            rows: [
                { benchmark: "200", delay: 1, area: 1, file_name: "bench200_1_1_keep.bench", status: "verified" },
            ],
        });
        fs.readdir
            .mockResolvedValueOnce([
                { isFile: () => true, name: "bench200_1_1_keep.bench" },
                { isFile: () => true, name: "bench200_2_2_old.bench" },
                { isFile: () => true, name: "manifest.json" },
            ])
            .mockResolvedValueOnce([
                { isFile: () => true, name: "bench200_1_1_keep.bench" },
                { isFile: () => true, name: "bench200_2_2_old.bench" },
                { isFile: () => true, name: "manifest.json" },
            ])
            .mockResolvedValueOnce([
                { isFile: () => true, name: "bench200_1_1_keep.bench" },
                { isFile: () => true, name: "deleted_bench200_2_2_old.bench" },
                { isFile: () => true, name: "manifest.json" },
            ])
            .mockResolvedValueOnce([
                { isFile: () => true, name: "bench200_1_1_keep.bench" },
                { isFile: () => true, name: "deleted_bench200_2_2_old.bench" },
                { isFile: () => true, name: "manifest.json" },
            ]);

        const req = {
            method: "GET",
            query: { authKey: "k", scope: "all" },
            headers: { host: "localhost:3000" },
        };

        const firstRes = createMockRes();
        await handler(req, firstRes);
        const secondRes = createMockRes();
        await handler(req, secondRes);

        expect(firstRes.statusCode).toBe(200);
        expect(secondRes.statusCode).toBe(200);
        expect(fs.rm).not.toHaveBeenCalled();
        expect(fs.rename).toHaveBeenCalledTimes(1);
        expect(String(fs.rename.mock.calls[0][0])).toContain("bench200_2_2_old.bench");
        expect(String(fs.rename.mock.calls[0][1])).toContain("deleted_bench200_2_2_old.bench");
    });
});

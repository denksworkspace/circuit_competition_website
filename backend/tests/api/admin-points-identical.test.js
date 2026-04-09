// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockReq, createMockRes } from "../helpers/mockHttp.js";

vi.mock("@vercel/postgres", () => ({ sql: vi.fn() }));
vi.mock("../../api/_roles.js", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        ensureCommandRolesSchema: vi.fn(),
    };
});
vi.mock("../../api/_lib/pointVerification.js", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        downloadPointCircuitText: vi.fn(),
    };
});
vi.mock("../../api/_lib/paretoFilenameSync.js", () => ({
    syncParetoFilenameCsvs: vi.fn(),
}));

import { sql } from "@vercel/postgres";
import { downloadPointCircuitText } from "../../api/_lib/pointVerification.js";
import handler from "../../api/admin-points-identical.js";

function queryTextFromSqlCall(call) {
    const [strings] = call;
    return Array.isArray(strings) ? strings.join(" ").toLowerCase() : "";
}

describe("api/admin-points-identical", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sql.mockResolvedValue({ rows: [], rowCount: 0 });
    });

    it("scans and returns duplicate groups while persisting missing hashes", async () => {
        sql.mockImplementation((strings) => {
            const text = Array.isArray(strings) ? strings.join(" ").toLowerCase() : "";
            if (text.includes("from public.commands") && text.includes("auth_key")) {
                return Promise.resolve({ rows: [{ id: 1, role: "admin" }], rowCount: 1 });
            }
            if (text.includes("from public.points") && text.includes("content_hash")) {
                return Promise.resolve({
                    rows: [
                        {
                            id: "p1",
                            benchmark: "255",
                            delay: 10,
                            area: 20,
                            sender: "a",
                            file_name: "a.bench",
                            created_at: "2026-03-04T10:00:00Z",
                            content_hash: null,
                        },
                        {
                            id: "p2",
                            benchmark: "255",
                            delay: 11,
                            area: 21,
                            sender: "b",
                            file_name: "b.bench",
                            created_at: "2026-03-04T09:00:00Z",
                            content_hash: null,
                        },
                    ],
                    rowCount: 2,
                });
            }
            return Promise.resolve({ rows: [], rowCount: 0 });
        });

        downloadPointCircuitText.mockResolvedValueOnce({ ok: true, circuitText: "same-content" });
        downloadPointCircuitText.mockResolvedValueOnce({ ok: true, circuitText: "same-content" });

        const req = createMockReq({ method: "POST", body: { authKey: "k", mode: "scan" } });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.groups).toHaveLength(1);
        expect(res.body.groups[0].points).toHaveLength(2);
        expect(downloadPointCircuitText).toHaveBeenCalledTimes(2);

        const updateHashQueries = sql.mock.calls.filter((call) => queryTextFromSqlCall(call).includes("set content_hash"));
        expect(updateHashQueries).toHaveLength(2);
        const pointsScanQuery = sql.mock.calls.find((call) => {
            const text = queryTextFromSqlCall(call);
            return text.includes("from public.points") && text.includes("content_hash");
        });
        expect(queryTextFromSqlCall(pointsScanQuery || [])).toContain("lower(coalesce(lifecycle_status, 'main')) = 'main'");
    });

    it("reuses stored hashes without downloading files", async () => {
        sql.mockImplementation((strings) => {
            const text = Array.isArray(strings) ? strings.join(" ").toLowerCase() : "";
            if (text.includes("from public.commands") && text.includes("auth_key")) {
                return Promise.resolve({ rows: [{ id: 1, role: "admin" }], rowCount: 1 });
            }
            if (text.includes("from public.points") && text.includes("content_hash")) {
                return Promise.resolve({
                    rows: [
                        {
                            id: "p1",
                            benchmark: "255",
                            delay: 10,
                            area: 20,
                            sender: "a",
                            file_name: "a.bench",
                            created_at: "2026-03-04T10:00:00Z",
                            content_hash: "abc123",
                        },
                        {
                            id: "p2",
                            benchmark: "255",
                            delay: 11,
                            area: 21,
                            sender: "b",
                            file_name: "b.bench",
                            created_at: "2026-03-04T09:00:00Z",
                            content_hash: "abc123",
                        },
                    ],
                    rowCount: 2,
                });
            }
            return Promise.resolve({ rows: [], rowCount: 0 });
        });

        const req = createMockReq({ method: "POST", body: { authKey: "k", mode: "scan" } });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.groups).toHaveLength(1);
        expect(downloadPointCircuitText).not.toHaveBeenCalled();

        const updateHashQueries = sql.mock.calls.filter((call) => queryTextFromSqlCall(call).includes("set content_hash"));
        expect(updateHashQueries).toHaveLength(0);
    });

    it("applies selected resolutions by deleting non-kept points", async () => {
        sql.mockImplementation((strings) => {
            const text = Array.isArray(strings) ? strings.join(" ").toLowerCase() : "";
            if (text.includes("from public.commands") && text.includes("auth_key")) {
                return Promise.resolve({ rows: [{ id: 1, role: "admin" }], rowCount: 1 });
            }
            if (text.includes("update public.points") && text.includes("set lifecycle_status = 'deleted'")) {
                return Promise.resolve({ rows: [], rowCount: 2 });
            }
            return Promise.resolve({ rows: [], rowCount: 0 });
        });

        const req = createMockReq({
            method: "POST",
            body: {
                authKey: "k",
                mode: "apply",
                resolutions: [
                    {
                        keepPointId: "p1",
                        removePointIds: ["p2", "p3"],
                    },
                ],
            },
        });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.deletedPoints).toBe(2);
        expect(res.body.appliedGroups).toBe(1);

        const allSqlTexts = sql.mock.calls.map((call) => queryTextFromSqlCall(call));
        expect(allSqlTexts.some((text) => text.includes("set lifecycle_status = 'deleted'"))).toBe(true);
        expect(allSqlTexts.some((text) => /\bdelete\s+from\s+points\b/i.test(text))).toBe(false);
    });
});

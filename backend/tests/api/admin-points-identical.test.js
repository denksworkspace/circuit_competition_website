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

import { sql } from "@vercel/postgres";
import { downloadPointCircuitText } from "../../api/_lib/pointVerification.js";
import handler from "../../api/admin-points-identical.js";

describe("api/admin-points-identical", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("scans and returns duplicate groups", async () => {
        sql.mockResolvedValueOnce({ rows: [{ id: 1, role: "admin" }] });
        sql.mockResolvedValueOnce({
            rows: [
                { id: "p1", benchmark: "255", delay: 10, area: 20, sender: "a", file_name: "a.bench", created_at: "2026-03-04T10:00:00Z" },
                { id: "p2", benchmark: "255", delay: 11, area: 21, sender: "b", file_name: "b.bench", created_at: "2026-03-04T09:00:00Z" },
            ],
        });
        downloadPointCircuitText.mockResolvedValueOnce({ ok: true, circuitText: "same-content" });
        downloadPointCircuitText.mockResolvedValueOnce({ ok: true, circuitText: "same-content" });

        const req = createMockReq({ method: "POST", body: { authKey: "k", mode: "scan" } });
        const res = createMockRes();
        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.groups).toHaveLength(1);
        expect(res.body.groups[0].points).toHaveLength(2);
    });

    it("applies selected resolutions by deleting non-kept points", async () => {
        sql.mockResolvedValueOnce({ rows: [{ id: 1, role: "admin" }] });
        sql.mockResolvedValueOnce({ rowCount: 2 });

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
    });
});

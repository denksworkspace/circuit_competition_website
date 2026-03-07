// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockReq, createMockRes } from "../helpers/mockHttp.js";

vi.mock("../../api/_lib/siteActivityLogs.js", () => ({
    addSiteActivityLogs: vi.fn(),
}));

import { addSiteActivityLogs } from "../../api/_lib/siteActivityLogs.js";
import handler from "../../api/site-activity-log.js";

describe("api/site-activity-log handler", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        addSiteActivityLogs.mockResolvedValue(0);
    });

    it("rejects non-POST method", async () => {
        const req = createMockReq({ method: "GET" });
        const res = createMockRes();
        await handler(req, res);
        expect(res.statusCode).toBe(405);
    });

    it("accepts batch events", async () => {
        addSiteActivityLogs.mockResolvedValueOnce(2);
        const req = createMockReq({
            method: "POST",
            body: {
                events: [
                    { eventType: "ui_click", clientTimestamp: "2026-01-01T00:00:00.000Z" },
                    { eventType: "api_request_finish", clientTimestamp: "2026-01-01T00:00:01.000Z" },
                ],
            },
        });
        const res = createMockRes();

        await handler(req, res);

        expect(addSiteActivityLogs).toHaveBeenCalledTimes(1);
        expect(addSiteActivityLogs).toHaveBeenCalledWith([
            { eventType: "ui_click", clientTimestamp: "2026-01-01T00:00:00.000Z" },
            { eventType: "api_request_finish", clientTimestamp: "2026-01-01T00:00:01.000Z" },
        ]);
        expect(res.statusCode).toBe(200);
        expect(res.body).toMatchObject({ ok: true, inserted: 2 });
    });

    it("accepts single event payload", async () => {
        addSiteActivityLogs.mockResolvedValueOnce(1);
        const req = createMockReq({
            method: "POST",
            body: { eventType: "app_start", clientTimestamp: "2026-01-01T00:00:00.000Z" },
        });
        const res = createMockRes();

        await handler(req, res);

        expect(addSiteActivityLogs).toHaveBeenCalledWith({
            eventType: "app_start",
            clientTimestamp: "2026-01-01T00:00:00.000Z",
        });
        expect(res.statusCode).toBe(200);
        expect(res.body.inserted).toBe(1);
    });

    it("returns 500 when persistence fails", async () => {
        addSiteActivityLogs.mockRejectedValueOnce(new Error("db down"));
        const req = createMockReq({
            method: "POST",
            body: { eventType: "ui_click" },
        });
        const res = createMockRes();

        await handler(req, res);

        expect(res.statusCode).toBe(500);
        expect(res.body.error).toContain("Failed to persist site activity logs.");
    });
});

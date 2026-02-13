import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vercel/postgres", () => ({ sql: vi.fn() }));

import { sql } from "@vercel/postgres";

async function importActionLogsModule() {
    vi.resetModules();
    return import("../../../api/_lib/actionLogs.js");
}

describe("api/_lib/actionLogs", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("addActionLog inserts entry", async () => {
        sql.mockResolvedValue({ rows: [] });
        const mod = await importActionLogsModule();

        await mod.addActionLog({
            commandId: 1,
            actorCommandId: 2,
            action: "point_created",
            details: { id: "p" },
        });

        expect(sql).toHaveBeenCalled();
    });

    it("getActionLogsForCommand maps rows", async () => {
        sql.mockImplementation((queryParts) => {
            const text = Array.isArray(queryParts) ? queryParts.join(" ") : "";
            if (text.includes("from command_action_logs")) {
                return Promise.resolve({
                    rows: [
                        {
                            id: "1",
                            command_id: "7",
                            actor_command_id: "2",
                            action: "x",
                            details: { k: 1 },
                            created_at: "2026-01-01T00:00:00.000Z",
                            actor_name: "admin",
                            target_name: "user",
                        },
                    ],
                });
            }
            return Promise.resolve({ rows: [] });
        });
        const mod = await importActionLogsModule();

        const rows = await mod.getActionLogsForCommand(7, 10);
        expect(rows[0]).toMatchObject({
            id: 1,
            commandId: 7,
            actorCommandId: 2,
            actorName: "admin",
            targetName: "user",
            action: "x",
        });
    });
});

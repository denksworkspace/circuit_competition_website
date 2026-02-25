// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
/** @vitest-environment jsdom */

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("recharts", () => {
    const Box = ({ children }) => <div>{children}</div>;
    return {
        ResponsiveContainer: Box,
        ScatterChart: Box,
        Scatter: Box,
        XAxis: Box,
        YAxis: Box,
        CartesianGrid: Box,
        Tooltip: Box,
        ReferenceLine: Box,
    };
});

import App from "../../src/App.jsx";

function jsonResponse(status, body) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: vi.fn().mockResolvedValue(body),
    };
}

function installFetchRouter(routes) {
    global.fetch = vi.fn(async (input, init = {}) => {
        const url = typeof input === "string" ? input : input.url;
        const method = String(init.method || "GET").toUpperCase();
        const key = `${method} ${url}`;
        const fallbackKey = `* ${url}`;
        const handler = routes[key] || routes[fallbackKey];

        if (!handler) {
            throw new Error(`Unexpected fetch: ${key}`);
        }

        return handler({ url, method, init });
    });
}

function bootstrapRoutes({ points = [], commands = [], authStatus = 200, authBody = { command: null } } = {}) {
    return {
        "GET /api/points": () => Promise.resolve(jsonResponse(200, { points })),
        "GET /api/commands": () => Promise.resolve(jsonResponse(200, { commands })),
        "POST /api/auth": () => Promise.resolve(jsonResponse(authStatus, authBody)),
        "GET /api/admin-users?authKey=key_ok&scope=all&limit=1000": () =>
            Promise.resolve(jsonResponse(200, { actionLogs: [] })),
    };
}

function withDefaultQuota(command) {
    if (!command) return command;
    return {
        maxSingleUploadBytes: 500 * 1024 * 1024,
        totalUploadQuotaBytes: 50 * 1024 * 1024 * 1024,
        uploadedBytesTotal: 0,
        remainingUploadBytes: 50 * 1024 * 1024 * 1024,
        maxMultiFileBatchCount: 100,
        ...command,
    };
}

describe("App integration", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        localStorage.clear();
        window.alert = vi.fn();
        window.confirm = vi.fn(() => true);
    });

    async function configureUploadSettings({ checker = "none", parser = "ABC" } = {}) {
        fireEvent.click(screen.getByRole("button", { name: "Open upload settings" }));
        fireEvent.change(screen.getByLabelText("checker"), {
            target: { value: checker },
        });
        fireEvent.change(screen.getByLabelText("parser parameters"), {
            target: { value: parser },
        });
    }

    it("logs in successfully with valid key", async () => {
        const routes = bootstrapRoutes({
            commands: [{ id: 1, name: "team1", color: "#111", role: "leader" }],
            authBody: { command: withDefaultQuota({ id: 1, name: "team1", color: "#111", role: "leader" }) },
        });
        installFetchRouter(routes);

        render(<App />);

        expect(await screen.findByText("Access key required")).toBeInTheDocument();

        fireEvent.change(screen.getByPlaceholderText("key_XXXXXXXXXXXXXXXX"), {
            target: { value: "key_ok" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Enter" }));

        expect(await screen.findByText("Circuit Control Platform")).toBeInTheDocument();
        expect(screen.getByText(/team1!/)).toBeInTheDocument();
        expect(screen.getByText("Hello,")).toBeInTheDocument();
        expect(localStorage.getItem("bench_auth_key")).toBe("key_ok");
    });

    it("shows login error for invalid key", async () => {
        const routes = bootstrapRoutes({
            commands: [{ id: 1, name: "team1", color: "#111", role: "leader" }],
            authStatus: 401,
            authBody: { error: "Invalid auth key." },
        });
        installFetchRouter(routes);

        render(<App />);

        fireEvent.change(await screen.findByPlaceholderText("key_XXXXXXXXXXXXXXXX"), {
            target: { value: "bad_key" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Enter" }));

        expect(await screen.findByText("Invalid auth key.")).toBeInTheDocument();
        expect(screen.getByText("Access key required")).toBeInTheDocument();
    });

    it("clears invalid saved key on bootstrap", async () => {
        localStorage.setItem("bench_auth_key", "stale_key");
        const routes = bootstrapRoutes({
            authStatus: 401,
            authBody: { error: "Invalid auth key." },
        });
        installFetchRouter(routes);

        render(<App />);

        expect(await screen.findByText("Saved key is no longer valid.")).toBeInTheDocument();
        expect(localStorage.getItem("bench_auth_key")).toBeNull();
    });

    it("validates uploaded file name pattern", async () => {
        const routes = bootstrapRoutes({
            authBody: { command: withDefaultQuota({ id: 1, name: "team1", color: "#111", role: "participant" }) },
        });
        installFetchRouter(routes);

        render(<App />);
        expect(await screen.findByText("Access key required")).toBeInTheDocument();

        fireEvent.change(screen.getByPlaceholderText("key_XXXXXXXXXXXXXXXX"), {
            target: { value: "key_ok" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Enter" }));

        await screen.findByText("Add a point");

        const fileInput = screen.getByLabelText("file");
        const invalidFile = new File(["x"], "invalid_name.bench", { type: "text/plain" });
        fireEvent.change(fileInput, { target: { files: [invalidFile] } });

        expect(await screen.findByText(/Invalid file name pattern/)).toBeInTheDocument();
    });

    it("validates multi-file count limit", async () => {
        const routes = bootstrapRoutes({
            authBody: { command: withDefaultQuota({ id: 1, name: "team1", color: "#111", role: "participant" }) },
        });
        installFetchRouter(routes);

        render(<App />);
        expect(await screen.findByText("Access key required")).toBeInTheDocument();

        fireEvent.change(screen.getByPlaceholderText("key_XXXXXXXXXXXXXXXX"), {
            target: { value: "key_ok" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Enter" }));
        await screen.findByText("Add a point");

        const fileInput = screen.getByLabelText("file");
        const files = Array.from({ length: 101 }, (_, i) => {
            const delay = i + 1;
            return new File(["bench data"], `bench254_${delay}_40.bench`, { type: "text/plain" });
        });
        fireEvent.change(fileInput, { target: { files } });

        expect(await screen.findByText(/Too many files selected\. Maximum is 100\./)).toBeInTheDocument();
    });

    it("uploads valid file and creates point", async () => {
        const command = withDefaultQuota({ id: 1, name: "team1", color: "#111", role: "participant" });
        const calls = [];

        installFetchRouter({
            ...bootstrapRoutes({ authBody: { command } }),
            "POST /api/points-validate-upload": () => {
                calls.push("validate-upload");
                return Promise.resolve(jsonResponse(200, { ok: true, files: [{ ok: true }] }));
            },
            "POST /api/points-upload-url": ({ init }) => {
                calls.push("upload-url");
                const body = JSON.parse(init.body);
                expect(body.fileName).toMatch(/^bench254_15_40_team1_/);
                return Promise.resolve(jsonResponse(200, { uploadUrl: "https://s3.example/upload" }));
            },
            "PUT https://s3.example/upload": () => {
                calls.push("put-s3");
                return Promise.resolve({ ok: true, status: 200, json: vi.fn().mockResolvedValue({}) });
            },
            "POST /api/points": ({ init }) => {
                calls.push("save-point");
                const body = JSON.parse(init.body);
                return Promise.resolve(
                    jsonResponse(201, {
                        point: {
                            id: body.id,
                            benchmark: 254,
                            delay: 15,
                            area: 40,
                            description: body.description,
                            sender: "team1",
                            fileName: body.fileName,
                            status: "non-verified",
                            checkerVersion: null,
                            downloadUrl: "https://cdn.example/points/x.bench",
                        },
                    })
                );
            },
        });

        render(<App />);

        fireEvent.change(await screen.findByPlaceholderText("key_XXXXXXXXXXXXXXXX"), {
            target: { value: "key_ok" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Enter" }));

        await screen.findByText("Add a point");
        await configureUploadSettings({ checker: "none", parser: "ABC" });

        fireEvent.change(screen.getByLabelText("description (max 200)"), {
            target: { value: "schema-test" },
        });

        const validFile = new File(["bench data"], "bench254_15_40.bench", { type: "text/plain" });
        fireEvent.change(screen.getByLabelText("file"), {
            target: { files: [validFile] },
        });

        fireEvent.click(screen.getByRole("button", { name: "Upload & create point" }));

        await waitFor(() => {
            expect(calls).toEqual(["validate-upload"]);
        });

        const applyButtons = await screen.findAllByRole("button", { name: "Apply" });
        fireEvent.click(applyButtons[applyButtons.length - 1]);
        await waitFor(() => {
            expect(calls).toEqual(["validate-upload", "upload-url", "put-s3", "save-point"]);
        });
        expect(await screen.findByText(/schema-test/)).toBeInTheDocument();
        expect(screen.getAllByText("delay=").length).toBeGreaterThan(0);
    });

    it("blocks upload when ABC metrics validation fails", async () => {
        const command = withDefaultQuota({ id: 1, name: "team1", color: "#111", role: "participant" });
        const calls = [];

        installFetchRouter({
            ...bootstrapRoutes({ authBody: { command } }),
            "POST /api/points-validate-upload": () => {
                calls.push("validate-upload");
                return Promise.resolve(
                    jsonResponse(422, {
                        error: "Circuit metrics do not match file names.",
                        files: [
                            {
                                fileName: "bench254_15_40.bench",
                                ok: false,
                                reason: "Metric mismatch: area expected 40, actual 41",
                            },
                        ],
                    })
                );
            },
        });

        render(<App />);

        fireEvent.change(await screen.findByPlaceholderText("key_XXXXXXXXXXXXXXXX"), {
            target: { value: "key_ok" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Enter" }));
        await screen.findByText("Add a point");
        await configureUploadSettings({ checker: "none", parser: "ABC" });

        const validFile = new File(["bench data"], "bench254_15_40.bench", { type: "text/plain" });
        fireEvent.change(screen.getByLabelText("file"), {
            target: { files: [validFile] },
        });

        fireEvent.click(screen.getByRole("button", { name: "Upload & create point" }));

        expect(
            await screen.findByLabelText("Add point with delay=15, area=40, verdict=failed to the chart?")
        ).toBeInTheDocument();
        expect(calls).toEqual(["validate-upload"]);
    });

    it("shows truth conflict modal for admin when benchmark is missing", async () => {
        const command = withDefaultQuota({ id: 1, name: "admin1", color: "#111", role: "admin" });
        installFetchRouter({
            ...bootstrapRoutes({ authBody: { command } }),
            "GET /api/admin-users?authKey=key_ok&userId=7": () =>
                Promise.resolve(jsonResponse(200, {
                    user: {
                        id: 7,
                        name: "u7",
                        role: "participant",
                        maxSingleUploadBytes: 1,
                        totalUploadQuotaBytes: 1,
                        uploadedBytesTotal: 0,
                        maxMultiFileBatchCount: 1,
                    },
                    actionLogs: [],
                })),
            "POST /api/truth-tables-plan": () =>
                Promise.resolve(jsonResponse(200, {
                    files: [
                        {
                            fileName: "bench299.truth",
                            benchmark: "299",
                            action: "requires_create_benchmark",
                            ok: false,
                        },
                    ],
                })),
        });

        render(<App />);
        fireEvent.change(await screen.findByPlaceholderText("key_XXXXXXXXXXXXXXXX"), {
            target: { value: "key_ok" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Enter" }));
        await screen.findByText("Admin logs");
        fireEvent.click(screen.getByRole("button", { name: "Open quota settings" }));

        fireEvent.change(screen.getByPlaceholderText("e.g. 7"), {
            target: { value: "7" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Load user" }));
        await screen.findByText(/User: /);

        const truthFile = new File(["truth"], "bench299.truth", { type: "text/plain" });
        fireEvent.change(screen.getByLabelText("Files"), {
            target: { files: [truthFile] },
        });

        fireEvent.click(screen.getByRole("button", { name: "Upload truth files" }));
        expect(await screen.findByText("Resolve truth upload conflicts")).toBeInTheDocument();
        expect(screen.getByText("Add new benchmark 299?")).toBeInTheDocument();
    });
});

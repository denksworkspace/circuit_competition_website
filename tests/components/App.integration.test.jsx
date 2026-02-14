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

        expect(await screen.findByText("Bench points")).toBeInTheDocument();
        expect(screen.getByText("team1")).toBeInTheDocument();
        expect(screen.getByText("role: leader")).toBeInTheDocument();
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

        fireEvent.change(screen.getByLabelText("description (max 200)"), {
            target: { value: "schema-test" },
        });

        const validFile = new File(["bench data"], "bench254_15_40.bench", { type: "text/plain" });
        fireEvent.change(screen.getByLabelText("file"), {
            target: { files: [validFile] },
        });

        fireEvent.click(screen.getByRole("button", { name: "Upload & create point" }));

        await waitFor(() => {
            expect(calls).toEqual(["upload-url", "put-s3", "save-point"]);
        });

        expect(await screen.findByText(/schema-test/)).toBeInTheDocument();
        expect(screen.getAllByText("delay=").length).toBeGreaterThan(0);
    });
});

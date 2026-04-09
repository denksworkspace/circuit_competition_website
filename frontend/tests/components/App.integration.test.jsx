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
        let handler = routes[key] || routes[fallbackKey];

        if (!handler && method === "GET" && url.startsWith("/api/points-upload-request-status?")) {
            const parsed = new URL(url, "http://localhost");
            const authKey = String(parsed.searchParams.get("authKey") || "").trim();
            const activeUrl = `/api/points-upload-request-active?authKey=${authKey}`;
            handler = routes[`GET ${activeUrl}`] || routes[`* ${activeUrl}`];
        }

        if (!handler) {
            throw new Error(`Unexpected fetch: ${key}`);
        }

        return handler({ url, method, init });
    });
}

function bootstrapRoutes({ points = [], commands = [], authStatus = 200, authBody = { command: null } } = {}) {
    return {
        "GET /api/points?authKey=key_ok": () => Promise.resolve(jsonResponse(200, { points })),
        "GET /api/commands?authKey=key_ok": () => Promise.resolve(jsonResponse(200, { commands })),
        "POST /api/auth": () => Promise.resolve(jsonResponse(authStatus, authBody)),
        "POST /api/points-duplicate-check": () => Promise.resolve(jsonResponse(200, { duplicate: false, point: null })),
        "GET /api/points-upload-request-active?authKey=key_ok": () =>
            Promise.resolve(jsonResponse(200, { request: null, files: [] })),
        "GET /api/admin-users?authKey=key_ok&scope=all&limit=1000": () =>
            Promise.resolve(jsonResponse(200, { actionLogs: [] })),
    };
}

function cloneUploadSnapshot(snapshot = { request: null, files: [] }) {
    return {
        request: snapshot?.request ? { ...snapshot.request } : null,
        files: Array.isArray(snapshot?.files) ? snapshot.files.map((row) => ({ ...row })) : [],
    };
}

function createUploadSnapshotHarness(initialSnapshot = { request: null, files: [] }) {
    let currentSnapshot = cloneUploadSnapshot(initialSnapshot);
    return {
        routes: {
            "GET /api/points-upload-request-active?authKey=key_ok": () =>
                Promise.resolve(jsonResponse(200, cloneUploadSnapshot(currentSnapshot))),
        },
        setSnapshot(nextSnapshot) {
            currentSnapshot = cloneUploadSnapshot(nextSnapshot);
            return cloneUploadSnapshot(currentSnapshot);
        },
        getSnapshot() {
            return cloneUploadSnapshot(currentSnapshot);
        },
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

    async function openManualVerdictModal() {
        fireEvent.click(await screen.findByRole("button", { name: "Apply manual verdict" }));
        await screen.findByText("Manual point apply");
    }

    function normalizeRenderedText(value) {
        return String(value || "").replace(/\s+/g, " ").trim();
    }

    async function expectLiveProcessedPanelText(matcher) {
        await waitFor(() => {
            const panel = screen.getByText("Live processed").closest(".uploadLivePanel");
            expect(panel).toBeTruthy();
            const text = normalizeRenderedText(panel?.textContent);
            if (matcher instanceof RegExp) {
                expect(text).toMatch(matcher);
                return;
            }
            expect(text).toContain(normalizeRenderedText(matcher));
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

    it("does not validate uploaded file name pattern on client side", async () => {
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

        expect(screen.queryByText(/Invalid file name pattern/)).not.toBeInTheDocument();
    });

    it("shows benchmark help and all matching benchmark options by prefix", async () => {
        const points = [
            { id: "p250", benchmark: 250, delay: 10, area: 100, description: "", sender: "team1", fileName: "a", status: "verified" },
            { id: "p251", benchmark: 251, delay: 11, area: 101, description: "", sender: "team1", fileName: "b", status: "verified" },
            { id: "p252", benchmark: 252, delay: 12, area: 102, description: "", sender: "team1", fileName: "c", status: "verified" },
            { id: "p253", benchmark: 253, delay: 13, area: 103, description: "", sender: "team1", fileName: "d", status: "verified" },
        ];
        const routes = bootstrapRoutes({
            points,
            authBody: { command: withDefaultQuota({ id: 1, name: "team1", color: "#111", role: "participant" }) },
        });
        installFetchRouter(routes);

        render(<App />);
        fireEvent.change(await screen.findByPlaceholderText("key_XXXXXXXXXXXXXXXX"), {
            target: { value: "key_ok" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Enter" }));
        await screen.findByText("Add a point");

        expect(screen.getByLabelText("Benchmark selection help")).toBeInTheDocument();
        expect(screen.getByText("To select a benchmark, type its number.")).toBeInTheDocument();

        const benchmarkInput = screen.getByRole("textbox", { name: "Benchmark" });
        fireEvent.focus(benchmarkInput);
        expect(await screen.findByRole("button", { name: "test" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "250" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "251" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "252" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "253" })).toBeInTheDocument();

        fireEvent.change(benchmarkInput, { target: { value: "25" } });
        expect(screen.queryByRole("button", { name: "test" })).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "250" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "251" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "252" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "253" })).toBeInTheDocument();

        expect(screen.getAllByText("pareto front only")).toHaveLength(2);
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

    it("shows upload monitor immediately before create request resolves", async () => {
        const command = withDefaultQuota({ id: 1, name: "team1", color: "#111", role: "participant" });
        let resolveCreateRequest = null;

        installFetchRouter({
            ...bootstrapRoutes({
                authBody: { command },
                points: [],
            }),
            "GET /api/points?authKey=key_ok": () => Promise.resolve(jsonResponse(200, { points: [] })),
            "POST /api/points-upload-request-create": () =>
                new Promise((resolve) => {
                    resolveCreateRequest = () => resolve(jsonResponse(201, {
                        request: {
                            id: "req_immediate_monitor",
                            status: "queued",
                            totalCount: 1,
                            doneCount: 0,
                            verifiedCount: 0,
                            currentFileName: "",
                            currentPhase: "",
                        },
                        files: [
                            {
                                fileId: "f_immediate_monitor",
                                originalFileName: "bench254_15_40.bench",
                                queueFileKey: "queue/req_immediate_monitor/f_immediate_monitor.bench",
                                uploadUrl: "https://s3.example/queue-upload-immediate",
                                method: "PUT",
                            },
                        ],
                    }));
                }),
            "PUT https://s3.example/queue-upload-immediate": () =>
                Promise.resolve({ ok: true, status: 200, json: vi.fn().mockResolvedValue({}) }),
            "POST /api/points-upload-request-run": () =>
                Promise.resolve(jsonResponse(200, {
                    request: {
                        id: "req_immediate_monitor",
                        status: "processing",
                        totalCount: 1,
                        doneCount: 0,
                        verifiedCount: 0,
                        currentFileName: "bench254_15_40.bench",
                        currentPhase: "download",
                    },
                    files: [
                        {
                            id: "f_immediate_monitor",
                            originalFileName: "bench254_15_40.bench",
                            processState: "processing",
                            verdict: "pending",
                            verdictReason: "",
                            canApply: false,
                            defaultChecked: false,
                            applied: false,
                            parsedBenchmark: null,
                            parsedDelay: null,
                            parsedArea: null,
                        },
                    ],
                })),
        });

        render(<App />);

        fireEvent.change(await screen.findByPlaceholderText("key_XXXXXXXXXXXXXXXX"), {
            target: { value: "key_ok" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Enter" }));
        await screen.findByText("Add a point");
        await configureUploadSettings({ checker: "none", parser: "ABC" });

        fireEvent.change(screen.getByLabelText("file"), {
            target: { files: [new File(["bench data"], "bench254_15_40.bench", { type: "text/plain" })] },
        });
        fireEvent.click(screen.getByRole("button", { name: "Upload & create point" }));

        expect(await screen.findByText("Live processed")).toBeInTheDocument();
        await expectLiveProcessedPanelText(/status:\s*saving to queue/i);
        await expectLiveProcessedPanelText(/saving to queue/i);

        await waitFor(() => {
            expect(resolveCreateRequest).toEqual(expect.any(Function));
        });
        resolveCreateRequest();
    });

    it("uploads valid file and creates point", async () => {
        const command = withDefaultQuota({ id: 1, name: "team1", color: "#111", role: "participant" });
        const calls = [];
        let points = [];
        const uploadQueue = createUploadSnapshotHarness();
        const manualPoint = {
            id: "p_manual_1",
            benchmark: 254,
            delay: 15,
            area: 40,
            description: "schema-test",
            sender: "team1",
            fileName: "bench254_15_40_team1_pid.bench",
            status: "non-verified",
            checkerVersion: null,
            downloadUrl: "https://cdn.example/points/x.bench",
        };

        installFetchRouter({
            ...bootstrapRoutes({
                authBody: { command },
                points,
            }),
            ...uploadQueue.routes,
            "GET /api/points?authKey=key_ok": () => Promise.resolve(jsonResponse(200, { points })),
            "POST /api/points-upload-request-create": ({ init }) => {
                calls.push("create-request");
                const body = JSON.parse(init.body);
                expect(body.files).toHaveLength(1);
                const created = {
                    request: {
                        id: "req1",
                        status: "queued",
                        totalCount: 1,
                        doneCount: 0,
                        verifiedCount: 0,
                        currentFileName: "",
                        currentPhase: "",
                    },
                    files: [
                        {
                            fileId: "f1",
                            originalFileName: "bench254_15_40.bench",
                            queueFileKey: "queue/req1/f1.bench",
                            uploadUrl: "https://s3.example/queue-upload",
                            method: "PUT",
                        },
                    ],
                };
                uploadQueue.setSnapshot({
                    request: created.request,
                    files: [
                        {
                            id: "f1",
                            originalFileName: "bench254_15_40.bench",
                            processState: "pending",
                            verdict: "pending",
                            verdictReason: "",
                            canApply: false,
                            manualReviewRequired: false,
                            defaultChecked: false,
                            applied: false,
                            parsedBenchmark: null,
                            parsedDelay: null,
                            parsedArea: null,
                        },
                    ],
                });
                return Promise.resolve(jsonResponse(201, created));
            },
            "PUT https://s3.example/queue-upload": () => {
                calls.push("put-queue");
                return Promise.resolve({ ok: true, status: 200, json: vi.fn().mockResolvedValue({}) });
            },
            "POST /api/points-upload-request-run": () => {
                calls.push("run-request");
                const snapshot = {
                    request: {
                        id: "req1",
                        status: "waiting_manual_verdict",
                        autoManualWindow: false,
                        totalCount: 1,
                        doneCount: 1,
                        verifiedCount: 0,
                        currentFileName: "",
                        currentPhase: "",
                    },
                    files: [
                        {
                            id: "f1",
                            originalFileName: "bench254_15_40.bench",
                            processState: "processed",
                            verdict: "non-verified",
                            verdictReason: "verification skipped or checker unavailable",
                            canApply: true,
                            manualReviewRequired: true,
                            defaultChecked: true,
                            applied: false,
                            parsedBenchmark: "254",
                            parsedDelay: 15,
                            parsedArea: 40,
                        },
                    ],
                };
                uploadQueue.setSnapshot(snapshot);
                return Promise.resolve(jsonResponse(200, snapshot));
            },
            "POST /api/points-upload-request-apply": () => {
                calls.push("apply-request");
                points = [manualPoint];
                const snapshot = {
                    request: {
                        id: "req1",
                        status: "completed",
                        totalCount: 1,
                        doneCount: 1,
                        verifiedCount: 0,
                        currentFileName: "",
                        currentPhase: "",
                    },
                    files: [
                        {
                            id: "f1",
                            originalFileName: "bench254_15_40.bench",
                            processState: "processed",
                            verdict: "non-verified",
                            verdictReason: "verification skipped or checker unavailable",
                            canApply: false,
                            defaultChecked: false,
                            applied: true,
                            parsedBenchmark: "254",
                            parsedDelay: 15,
                            parsedArea: 40,
                        },
                    ],
                    savedPoints: [manualPoint],
                    errors: [],
                };
                uploadQueue.setSnapshot(snapshot);
                return Promise.resolve(jsonResponse(200, snapshot));
            },
            "GET /api/pareto-export-status?authKey=key_ok": () =>
                Promise.resolve(jsonResponse(200, {
                    hasNewPareto: true,
                    lastParetoExportAt: "2026-04-08T10:00:00.000Z",
                })),
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
            expect(calls).toContain("run-request");
        });

        expect(screen.getByRole("textbox", { name: "Benchmark" })).toHaveValue("test");
        expect(screen.queryByText("Manual point apply")).not.toBeInTheDocument();
        await openManualVerdictModal();
        expect(
            screen.getByLabelText(/Add point with bench=254, delay=15, area=40, status=waiting manual verdict, detected verdict=non-verified/)
        ).toBeChecked();
        const applyButtons = await screen.findAllByRole("button", { name: "Apply" });
        fireEvent.click(applyButtons[applyButtons.length - 1]);
        await waitFor(() => {
            expect(calls).toContain("apply-request");
        });
        expect(await screen.findByText(/schema-test/)).toBeInTheDocument();
        expect(screen.getAllByText("delay=").length).toBeGreaterThan(0);
        await waitFor(() => {
            expect(screen.getByRole("button", { name: "Open Pareto export" })).toHaveClass("hasNew");
        });
    });

    it("blocks upload when ABC metrics validation fails", async () => {
        const command = withDefaultQuota({ id: 1, name: "team1", color: "#111", role: "participant" });
        const calls = [];
        const uploadQueue = createUploadSnapshotHarness();

        installFetchRouter({
            ...bootstrapRoutes({ authBody: { command } }),
            ...uploadQueue.routes,
            "POST /api/points-upload-request-create": () => {
                calls.push("create-request");
                const created = {
                    request: {
                        id: "req_fail",
                        status: "queued",
                        totalCount: 1,
                        doneCount: 0,
                        verifiedCount: 0,
                        currentFileName: "",
                        currentPhase: "",
                    },
                    files: [
                        {
                            fileId: "f_fail",
                            originalFileName: "bench254_15_40.bench",
                            queueFileKey: "queue/req_fail/f_fail.bench",
                            uploadUrl: "https://s3.example/queue-upload-fail",
                            method: "PUT",
                        },
                    ],
                };
                uploadQueue.setSnapshot({
                    request: created.request,
                    files: [
                        {
                            id: "f_fail",
                            originalFileName: "bench254_15_40.bench",
                            processState: "pending",
                            verdict: "pending",
                            verdictReason: "",
                            canApply: false,
                            manualReviewRequired: false,
                            defaultChecked: false,
                            applied: false,
                            parsedBenchmark: null,
                            parsedDelay: null,
                            parsedArea: null,
                        },
                    ],
                });
                return Promise.resolve(jsonResponse(201, created));
            },
            "PUT https://s3.example/queue-upload-fail": () => {
                calls.push("put-queue");
                return Promise.resolve({ ok: true, status: 200, json: vi.fn().mockResolvedValue({}) });
            },
            "POST /api/points-upload-request-run": () => {
                calls.push("run-request");
                const snapshot = {
                    request: {
                        id: "req_fail",
                        status: "waiting_manual_verdict",
                        autoManualWindow: false,
                        totalCount: 1,
                        doneCount: 1,
                        verifiedCount: 0,
                        currentFileName: "",
                        currentPhase: "",
                    },
                    files: [
                        {
                            id: "f_fail",
                            originalFileName: "bench254_15_40.bench",
                            processState: "processed",
                            verdict: "failed",
                            verdictReason: "Metric mismatch: area expected 40, actual 41",
                            canApply: true,
                            manualReviewRequired: true,
                            defaultChecked: true,
                            applied: false,
                            parsedBenchmark: "254",
                            parsedDelay: 15,
                            parsedArea: 40,
                        },
                    ],
                };
                uploadQueue.setSnapshot(snapshot);
                return Promise.resolve(jsonResponse(200, snapshot));
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

        expect(await screen.findByRole("button", { name: "Apply manual verdict" })).toBeInTheDocument();
        expect(screen.queryByText("Manual point apply")).not.toBeInTheDocument();
        await openManualVerdictModal();
        expect(
            await screen.findByLabelText(/Add point with bench=254, delay=15, area=40, status=waiting manual verdict, detected verdict=failed/)
        ).not.toBeChecked();
        expect(calls).toEqual(["create-request", "put-queue", "run-request"]);
    });

    it("allows a new upload while finished monitor remains visible", async () => {
        const command = withDefaultQuota({ id: 1, name: "team1", color: "#111", role: "participant" });
        localStorage.setItem("bench_auth_key", "key_ok");

        installFetchRouter({
            ...bootstrapRoutes({
                authBody: { command },
            }),
            "GET /api/points-upload-request-active?authKey=key_ok": () =>
                Promise.resolve(jsonResponse(200, {
                    request: {
                        id: "req_finished",
                        status: "completed",
                        totalCount: 1,
                        doneCount: 1,
                        verifiedCount: 1,
                        paretoFrontCount: 1,
                        currentFileName: "",
                        currentPhase: "saving",
                    },
                    files: [
                        {
                            id: "f_finished",
                            originalFileName: "bench254_15_40.bench",
                            processState: "processed",
                            verdict: "verified",
                            verdictReason: "",
                            canApply: false,
                            manualReviewRequired: false,
                            defaultChecked: false,
                            applied: true,
                            parsedBenchmark: "254",
                            parsedDelay: 15,
                            parsedArea: 40,
                        },
                    ],
                })),
        });

        render(<App />);

        await screen.findByText("Add a point");
        expect(await screen.findByText("Live processed")).toBeInTheDocument();
        await expectLiveProcessedPanelText(/status:\s*finished/i);

        await configureUploadSettings({ checker: "none", parser: "ABC" });
        fireEvent.change(screen.getByLabelText("file"), {
            target: { files: [new File(["bench data"], "bench254_16_41.bench", { type: "text/plain" })] },
        });

        await waitFor(() => {
            expect(screen.getByRole("button", { name: "Upload & create point" })).toBeEnabled();
        });
        expect(screen.getByTestId("upload-submit-wrap")).toHaveAttribute("title", "");
    });

    it("restores waiting manual verdict after reload and blocks a new upload", async () => {
        const command = withDefaultQuota({ id: 1, name: "team1", color: "#111", role: "participant" });
        localStorage.setItem("bench_auth_key", "key_ok");

        installFetchRouter({
            ...bootstrapRoutes({
                authBody: { command },
            }),
            "GET /api/points-upload-request-active?authKey=key_ok": () =>
                Promise.resolve(jsonResponse(200, {
                    request: {
                        id: "req_restore",
                        status: "waiting_manual_verdict",
                        autoManualWindow: false,
                        totalCount: 1,
                        doneCount: 1,
                        verifiedCount: 0,
                        currentFileName: "",
                        currentPhase: "",
                    },
                    files: [
                        {
                            id: "f_restore",
                            originalFileName: "bench254_15_40.bench",
                            processState: "processed",
                            verdict: "non-verified",
                            verdictReason: "verification skipped or checker unavailable",
                            canApply: true,
                            manualReviewRequired: true,
                            defaultChecked: true,
                            applied: false,
                            parsedBenchmark: "254",
                            parsedDelay: 15,
                            parsedArea: 40,
                        },
                    ],
                })),
        });

        render(<App />);

        await screen.findByText("Add a point");
        expect(await screen.findByText("Live processed")).toBeInTheDocument();
        expect(await screen.findByRole("button", { name: "Apply manual verdict" })).toBeInTheDocument();
        expect(screen.queryByText("Manual point apply")).not.toBeInTheDocument();

        await configureUploadSettings({ checker: "none", parser: "ABC" });
        fireEvent.change(screen.getByLabelText("file"), {
            target: { files: [new File(["bench data"], "bench254_16_41.bench", { type: "text/plain" })] },
        });

        expect(screen.getByRole("button", { name: "Upload & create point" })).toBeDisabled();
        expect(screen.getByTestId("upload-submit-wrap")).toHaveAttribute(
            "title",
            "Resolve manual verdict for the previous upload first.",
        );
    });

    it("restores interrupted request with auto manual window enabled without opening manual flow", async () => {
        const command = withDefaultQuota({ id: 1, name: "team1", color: "#111", role: "participant" });
        localStorage.setItem("bench_auth_key", "key_ok");

        installFetchRouter({
            ...bootstrapRoutes({
                authBody: { command },
            }),
            "GET /api/points-upload-request-active?authKey=key_ok": () =>
                Promise.resolve(jsonResponse(200, {
                    request: {
                        id: "req_interrupted_auto",
                        status: "interrupted",
                        autoManualWindow: true,
                        totalCount: 2,
                        doneCount: 1,
                        verifiedCount: 0,
                        currentFileName: "",
                        currentPhase: "",
                        error: "Upload was interrupted by user.",
                    },
                    files: [
                        {
                            id: "f_interrupted_auto",
                            originalFileName: "bench254_15_40.bench",
                            processState: "processed",
                            verdict: "non-verified",
                            verdictReason: "verification skipped or checker unavailable",
                            canApply: true,
                            manualReviewRequired: true,
                            defaultChecked: true,
                            applied: false,
                            parsedBenchmark: "254",
                            parsedDelay: 15,
                            parsedArea: 40,
                        },
                        {
                            id: "f_interrupted_pending",
                            originalFileName: "bench254_16_41.bench",
                            processState: "non-processed",
                            verdict: "non-processed",
                            verdictReason: "Upload was interrupted by user.",
                            canApply: false,
                            manualReviewRequired: false,
                            defaultChecked: false,
                            applied: false,
                            parsedBenchmark: null,
                            parsedDelay: null,
                            parsedArea: null,
                        },
                    ],
                })),
        });

        render(<App />);

        await screen.findByText("Add a point");
        expect(await screen.findByText("Live processed")).toBeInTheDocument();
        expect(screen.queryByText("Manual point apply")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Apply manual verdict" })).not.toBeInTheDocument();

        await configureUploadSettings({ checker: "none", parser: "ABC" });
        fireEvent.change(screen.getByLabelText("file"), {
            target: { files: [new File(["bench data"], "bench254_17_42.bench", { type: "text/plain" })] },
        });

        await waitFor(() => {
            expect(screen.getByRole("button", { name: "Upload & create point" })).toBeEnabled();
        });
        expect(screen.getByTestId("upload-submit-wrap")).toHaveAttribute("title", "");
    });

    it("restores interrupted request with manual flow enabled and shows apply button below live processed", async () => {
        const command = withDefaultQuota({ id: 1, name: "team1", color: "#111", role: "participant" });
        localStorage.setItem("bench_auth_key", "key_ok");

        installFetchRouter({
            ...bootstrapRoutes({
                authBody: { command },
            }),
            "GET /api/points-upload-request-active?authKey=key_ok": () =>
                Promise.resolve(jsonResponse(200, {
                    request: {
                        id: "req_interrupted_manual",
                        status: "interrupted",
                        autoManualWindow: false,
                        totalCount: 2,
                        doneCount: 1,
                        verifiedCount: 0,
                        currentFileName: "",
                        currentPhase: "",
                        error: "Upload was interrupted by user.",
                    },
                    files: [
                        {
                            id: "f_interrupted_manual",
                            originalFileName: "bench254_15_40.bench",
                            processState: "processed",
                            verdict: "non-verified",
                            verdictReason: "verification skipped or checker unavailable",
                            canApply: true,
                            manualReviewRequired: true,
                            defaultChecked: true,
                            applied: false,
                            parsedBenchmark: "254",
                            parsedDelay: 15,
                            parsedArea: 40,
                        },
                        {
                            id: "f_interrupted_manual_pending",
                            originalFileName: "bench254_16_41.bench",
                            processState: "non-processed",
                            verdict: "non-processed",
                            verdictReason: "Upload was interrupted by user.",
                            canApply: false,
                            manualReviewRequired: false,
                            defaultChecked: false,
                            applied: false,
                            parsedBenchmark: null,
                            parsedDelay: null,
                            parsedArea: null,
                        },
                    ],
                })),
        });

        render(<App />);

        await screen.findByText("Add a point");
        expect(await screen.findByText("Live processed")).toBeInTheDocument();
        expect(screen.queryByText("Manual point apply")).not.toBeInTheDocument();
        expect(await screen.findByRole("button", { name: "Apply manual verdict" })).toBeInTheDocument();

        await configureUploadSettings({ checker: "none", parser: "ABC" });
        fireEvent.change(screen.getByLabelText("file"), {
            target: { files: [new File(["bench data"], "bench254_17_42.bench", { type: "text/plain" })] },
        });

        expect(screen.getByRole("button", { name: "Upload & create point" })).toBeDisabled();
        expect(screen.getByTestId("upload-submit-wrap")).toHaveAttribute(
            "title",
            "Resolve manual verdict for the previous upload first.",
        );
    });

    it("restores failed request with manual pending rows and keeps manual flow accessible", async () => {
        const command = withDefaultQuota({ id: 1, name: "team1", color: "#111", role: "participant" });
        localStorage.setItem("bench_auth_key", "key_ok");

        installFetchRouter({
            ...bootstrapRoutes({
                authBody: { command },
            }),
            "GET /api/points-upload-request-active?authKey=key_ok": () =>
                Promise.resolve(jsonResponse(200, {
                    request: {
                        id: "req_failed_restore",
                        status: "failed",
                        autoManualWindow: false,
                        totalCount: 1,
                        doneCount: 1,
                        verifiedCount: 0,
                        currentFileName: "",
                        currentPhase: "",
                        error: "Failed to process upload request.",
                    },
                    files: [
                        {
                            id: "f_failed_restore",
                            originalFileName: "bench254_15_40.bench",
                            processState: "processed",
                            verdict: "failed",
                            verdictReason: "checker/parser failed with unknown reason",
                            canApply: true,
                            manualReviewRequired: true,
                            defaultChecked: false,
                            applied: false,
                            parsedBenchmark: "254",
                            parsedDelay: 15,
                            parsedArea: 40,
                        },
                    ],
                })),
        });

        render(<App />);

        await screen.findByText("Add a point");
        expect(screen.queryByText("Manual point apply")).not.toBeInTheDocument();
        expect(await screen.findByRole("button", { name: "Apply manual verdict" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Upload & create point" })).toBeDisabled();
        expect(screen.getByTestId("upload-submit-wrap")).toHaveAttribute(
            "title",
            "Resolve manual verdict for the previous upload first.",
        );
    });

    it("closes manual modal immediately without waiting for close request", async () => {
        const command = withDefaultQuota({ id: 1, name: "team1", color: "#111", role: "participant" });
        localStorage.setItem("bench_auth_key", "key_ok");
        let resolveCloseRequest = null;

        installFetchRouter({
            ...bootstrapRoutes({
                authBody: { command },
            }),
            "GET /api/points-upload-request-active?authKey=key_ok": () =>
                Promise.resolve(jsonResponse(200, {
                    request: {
                        id: "req_restore",
                        status: "waiting_manual_verdict",
                        autoManualWindow: false,
                        totalCount: 1,
                        doneCount: 1,
                        verifiedCount: 0,
                        currentFileName: "",
                        currentPhase: "",
                    },
                    files: [
                        {
                            id: "f_restore",
                            originalFileName: "bench254_15_40.bench",
                            processState: "processed",
                            verdict: "non-verified",
                            verdictReason: "verification skipped or checker unavailable",
                            canApply: true,
                            manualReviewRequired: true,
                            defaultChecked: true,
                            applied: false,
                            parsedBenchmark: "254",
                            parsedDelay: 15,
                            parsedArea: 40,
                        },
                    ],
                })),
            "POST /api/points-upload-request-close": () =>
                new Promise((resolve) => {
                    resolveCloseRequest = () => resolve(jsonResponse(200, {
                        request: {
                            id: "req_restore",
                            status: "closed",
                            totalCount: 1,
                            doneCount: 1,
                            verifiedCount: 0,
                            currentFileName: "",
                            currentPhase: "",
                        },
                        files: [],
                    }));
                }),
        });

        render(<App />);

        await screen.findByText("Add a point");
        await openManualVerdictModal();

        fireEvent.click(screen.getByRole("button", { name: "Close" }));

        await waitFor(() => {
            expect(screen.queryByText("Manual point apply")).not.toBeInTheDocument();
        });

        await waitFor(() => {
            expect(resolveCloseRequest).toEqual(expect.any(Function));
        });
        await new Promise((resolve) => setTimeout(resolve, 2200));
        expect(screen.queryByText("Manual point apply")).not.toBeInTheDocument();
        resolveCloseRequest();
    }, 12000);

    it("keeps manual modal closed and shows manual action button when close request fails", async () => {
        const command = withDefaultQuota({ id: 1, name: "team1", color: "#111", role: "participant" });
        localStorage.setItem("bench_auth_key", "key_ok");

        installFetchRouter({
            ...bootstrapRoutes({
                authBody: { command },
            }),
            "GET /api/points-upload-request-active?authKey=key_ok": () =>
                Promise.resolve(jsonResponse(200, {
                    request: {
                        id: "req_restore_error",
                        status: "waiting_manual_verdict",
                        autoManualWindow: false,
                        totalCount: 1,
                        doneCount: 1,
                        verifiedCount: 0,
                        currentFileName: "",
                        currentPhase: "",
                    },
                    files: [
                        {
                            id: "f_restore_error",
                            originalFileName: "bench254_15_40.bench",
                            processState: "processed",
                            verdict: "non-verified",
                            verdictReason: "verification skipped or checker unavailable",
                            canApply: true,
                            manualReviewRequired: true,
                            defaultChecked: true,
                            applied: false,
                            parsedBenchmark: "254",
                            parsedDelay: 15,
                            parsedArea: 40,
                        },
                    ],
                })),
            "POST /api/points-upload-request-close": () =>
                Promise.resolve(jsonResponse(500, {
                    error: "close failed",
                })),
        });

        render(<App />);

        await screen.findByText("Add a point");
        await openManualVerdictModal();

        fireEvent.click(screen.getByRole("button", { name: "Close" }));

        await waitFor(() => {
            expect(screen.queryByText("Manual point apply")).not.toBeInTheDocument();
        });

        expect(await screen.findByText("close failed")).toBeInTheDocument();
        expect(screen.queryByText("Manual point apply")).not.toBeInTheDocument();
        expect(await screen.findByRole("button", { name: "Apply manual verdict" })).toBeInTheDocument();
    });

    it("apply without selected manual rows closes request without confirm dialog", async () => {
        const command = withDefaultQuota({ id: 1, name: "team1", color: "#111", role: "participant" });
        localStorage.setItem("bench_auth_key", "key_ok");
        const closeCalls = [];
        window.confirm = vi.fn(() => false);

        installFetchRouter({
            ...bootstrapRoutes({
                authBody: { command },
            }),
            "GET /api/points-upload-request-active?authKey=key_ok": () =>
                Promise.resolve(jsonResponse(200, {
                    request: {
                        id: "req_apply_empty",
                        status: "waiting_manual_verdict",
                        autoManualWindow: false,
                        totalCount: 1,
                        doneCount: 1,
                        verifiedCount: 0,
                        currentFileName: "",
                        currentPhase: "",
                    },
                    files: [
                        {
                            id: "f_apply_empty",
                            originalFileName: "bench254_15_40.bench",
                            processState: "processed",
                            verdict: "failed",
                            verdictReason: "checker/parser failed with unknown reason",
                            canApply: true,
                            manualReviewRequired: true,
                            defaultChecked: false,
                            applied: false,
                            parsedBenchmark: "254",
                            parsedDelay: 15,
                            parsedArea: 40,
                        },
                    ],
                })),
            "POST /api/points-upload-request-close": () => {
                closeCalls.push("close-request");
                return Promise.resolve(jsonResponse(200, {
                    request: {
                        id: "req_apply_empty",
                        status: "closed",
                        totalCount: 1,
                        doneCount: 1,
                        verifiedCount: 0,
                        currentFileName: "",
                        currentPhase: "",
                    },
                    files: [],
                }));
            },
        });

        render(<App />);

        await screen.findByText("Add a point");
        await openManualVerdictModal();

        const applyButtons = await screen.findAllByRole("button", { name: "Apply" });
        fireEvent.click(applyButtons[applyButtons.length - 1]);

        await waitFor(() => {
            expect(screen.queryByText("Manual point apply")).not.toBeInTheDocument();
        });
        expect(closeCalls).toEqual(["close-request"]);
        expect(window.confirm).not.toHaveBeenCalled();
    });

    it("opens manual modal only after all files finish processing", async () => {
        const command = withDefaultQuota({ id: 1, name: "team1", color: "#111", role: "participant" });
        const calls = [];
        const uploadQueue = createUploadSnapshotHarness();

        installFetchRouter({
            ...bootstrapRoutes({
                authBody: { command },
            }),
            ...uploadQueue.routes,
            "POST /api/points-upload-request-create": () => {
                const created = {
                    request: {
                        id: "req_batch",
                        status: "queued",
                        totalCount: 2,
                        doneCount: 0,
                        verifiedCount: 0,
                        currentFileName: "",
                        currentPhase: "",
                    },
                    files: [
                        {
                            fileId: "f1",
                            originalFileName: "bench254_15_40.bench",
                            queueFileKey: "queue/req_batch/f1.bench",
                            uploadUrl: "https://s3.example/queue-upload-1",
                            method: "PUT",
                        },
                        {
                            fileId: "f2",
                            originalFileName: "bench254_16_41.bench",
                            queueFileKey: "queue/req_batch/f2.bench",
                            uploadUrl: "https://s3.example/queue-upload-2",
                            method: "PUT",
                        },
                    ],
                };
                uploadQueue.setSnapshot({
                    request: created.request,
                    files: [
                        {
                            id: "f1",
                            originalFileName: "bench254_15_40.bench",
                            processState: "pending",
                            verdict: "pending",
                            verdictReason: "",
                            canApply: false,
                            manualReviewRequired: false,
                            defaultChecked: false,
                            applied: false,
                            parsedBenchmark: null,
                            parsedDelay: null,
                            parsedArea: null,
                        },
                        {
                            id: "f2",
                            originalFileName: "bench254_16_41.bench",
                            processState: "pending",
                            verdict: "pending",
                            verdictReason: "",
                            canApply: false,
                            manualReviewRequired: false,
                            defaultChecked: false,
                            applied: false,
                            parsedBenchmark: null,
                            parsedDelay: null,
                            parsedArea: null,
                        },
                    ],
                });
                return Promise.resolve(jsonResponse(201, created));
            },
            "PUT https://s3.example/queue-upload-1": () => Promise.resolve({ ok: true, status: 200, json: vi.fn().mockResolvedValue({}) }),
            "PUT https://s3.example/queue-upload-2": () => Promise.resolve({ ok: true, status: 200, json: vi.fn().mockResolvedValue({}) }),
            "POST /api/points-upload-request-run": () => {
                calls.push("run-1");
                const snapshot = {
                    request: {
                        id: "req_batch",
                        status: "waiting_manual_verdict",
                        autoManualWindow: false,
                        totalCount: 2,
                        doneCount: 2,
                        verifiedCount: 0,
                        currentFileName: "",
                        currentPhase: "",
                    },
                    files: [
                        {
                            id: "f1",
                            originalFileName: "bench254_15_40.bench",
                            processState: "processed",
                            verdict: "non-verified",
                            verdictReason: "verification skipped or checker unavailable",
                            canApply: true,
                            manualReviewRequired: true,
                            defaultChecked: true,
                            applied: false,
                            parsedBenchmark: "254",
                            parsedDelay: 15,
                            parsedArea: 40,
                        },
                        {
                            id: "f2",
                            originalFileName: "bench254_16_41.bench",
                            processState: "processed",
                            verdict: "failed",
                            verdictReason: "Metric mismatch",
                            canApply: true,
                            manualReviewRequired: true,
                            defaultChecked: true,
                            applied: false,
                            parsedBenchmark: "254",
                            parsedDelay: 16,
                            parsedArea: 41,
                        },
                    ],
                };
                uploadQueue.setSnapshot(snapshot);
                return Promise.resolve(jsonResponse(200, snapshot));
            },
        });

        render(<App />);

        fireEvent.change(await screen.findByPlaceholderText("key_XXXXXXXXXXXXXXXX"), {
            target: { value: "key_ok" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Enter" }));
        await screen.findByText("Add a point");
        await configureUploadSettings({ checker: "none", parser: "ABC" });

        fireEvent.change(screen.getByLabelText("file"), {
            target: {
                files: [
                    new File(["bench data"], "bench254_15_40.bench", { type: "text/plain" }),
                    new File(["bench data"], "bench254_16_41.bench", { type: "text/plain" }),
                ],
            },
        });

        fireEvent.click(screen.getByRole("button", { name: "Upload & create point" }));

        await waitFor(() => {
            expect(calls).toContain("run-1");
        });
        expect(screen.queryByText("Please wait, starting circuit upload may take up to a minute")).not.toBeInTheDocument();
        expect(screen.queryByText("Manual point apply")).not.toBeInTheDocument();

        expect(await screen.findByRole("button", { name: "Apply manual verdict" })).toBeInTheDocument();
        expect(screen.queryByText("Manual point apply")).not.toBeInTheDocument();
        await openManualVerdictModal();
        expect(
            screen.getByLabelText(/Add point with bench=254, delay=15, area=40, status=waiting manual verdict, detected verdict=non-verified/)
        ).toBeChecked();
        expect(
            await screen.findByLabelText(/Add point with bench=254, delay=16, area=41, status=waiting manual verdict, detected verdict=failed/)
        ).not.toBeChecked();
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

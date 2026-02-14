// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    deletePoint,
    fetchCommandByAuthKey,
    fetchCommands,
    fetchPoints,
    requestUploadUrl,
    savePoint,
} from "../../src/services/apiClient.js";

function mockResponse({ ok = true, body = {}, jsonReject = false } = {}) {
    return {
        ok,
        json: jsonReject ? vi.fn().mockRejectedValue(new Error("bad json")) : vi.fn().mockResolvedValue(body),
    };
}

describe("apiClient", () => {
    beforeEach(() => {
        global.fetch = vi.fn();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("fetchCommands returns command list", async () => {
        fetch.mockResolvedValueOnce(mockResponse({ body: { commands: [{ id: 1 }] } }));
        await expect(fetchCommands()).resolves.toEqual([{ id: 1 }]);
    });

    it("fetchCommands throws server error message", async () => {
        fetch.mockResolvedValueOnce(mockResponse({ ok: false, body: { error: "boom" } }));
        await expect(fetchCommands()).rejects.toThrow("boom");
    });

    it("fetchCommandByAuthKey sends request body and returns command", async () => {
        fetch.mockResolvedValueOnce(mockResponse({ body: { command: { id: 2 } } }));
        await expect(fetchCommandByAuthKey("k")).resolves.toEqual({ id: 2 });
        expect(fetch).toHaveBeenCalledWith(
            "/api/auth",
            expect.objectContaining({ method: "POST" })
        );
    });

    it("fetchPoints handles invalid JSON fallback", async () => {
        fetch.mockResolvedValueOnce(mockResponse({ ok: false, jsonReject: true }));
        await expect(fetchPoints()).rejects.toThrow("Failed to load points.");
    });

    it("requestUploadUrl throws API message", async () => {
        fetch.mockResolvedValueOnce(mockResponse({ ok: false, body: { error: "too large" } }));
        await expect(requestUploadUrl({ authKey: "k", fileName: "f", fileSize: 1 })).rejects.toThrow("too large");
    });

    it("requestUploadUrl sends default batchSize=1", async () => {
        fetch.mockResolvedValueOnce(mockResponse({ body: { uploadUrl: "https://u" } }));
        await requestUploadUrl({ authKey: "k", fileName: "f", fileSize: 1 });

        const [, init] = fetch.mock.calls[0];
        const body = JSON.parse(init.body);
        expect(body.batchSize).toBe(1);
    });

    it("savePoint returns null when point missing in response", async () => {
        fetch.mockResolvedValueOnce(mockResponse({ body: {} }));
        await expect(savePoint({ id: "1" })).resolves.toEqual({ point: null, quota: null });
    });

    it("deletePoint throws fallback message", async () => {
        fetch.mockResolvedValueOnce(mockResponse({ ok: false, jsonReject: true }));
        await expect(deletePoint({ id: "1", authKey: "k" })).rejects.toThrow("Failed to delete point.");
    });
});

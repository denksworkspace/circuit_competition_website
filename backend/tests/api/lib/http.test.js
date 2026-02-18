// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { describe, expect, it } from "vitest";
import { parseBody, rejectMethod } from "../../../api/_lib/http.js";
import { createMockReq, createMockRes } from "../../helpers/mockHttp.js";

describe("api/_lib/http", () => {
    it("parseBody returns object body as-is", () => {
        const req = createMockReq({ body: { x: 1 } });
        expect(parseBody(req)).toEqual({ x: 1 });
    });

    it("parseBody parses JSON string and handles invalid JSON", () => {
        expect(parseBody(createMockReq({ body: '{"a":2}' }))).toEqual({ a: 2 });
        expect(parseBody(createMockReq({ body: "not-json" }))).toEqual({});
    });

    it("rejectMethod returns 405 and sets Allow for forbidden method", () => {
        const req = createMockReq({ method: "PUT" });
        const res = createMockRes();

        const rejected = rejectMethod(req, res, ["GET", "POST"]);
        expect(rejected).toBe(true);
        expect(res.statusCode).toBe(405);
        expect(res.headers.Allow).toBe("GET, POST");
        expect(res.ended).toBe(true);
    });

    it("rejectMethod allows whitelisted method", () => {
        const req = createMockReq({ method: "GET" });
        const res = createMockRes();

        const rejected = rejectMethod(req, res, ["GET", "POST"]);
        expect(rejected).toBe(false);
        expect(res.statusCode).toBe(200);
    });
});

// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import crypto from "node:crypto";

export function normalizeCircuitTextForHash(textRaw) {
    return String(textRaw || "")
        .replace(/^\uFEFF/, "")
        .replace(/\r\n?/g, "\n")
        .trimEnd();
}

export function sha256Hex(textRaw) {
    return crypto
        .createHash("sha256")
        .update(normalizeCircuitTextForHash(textRaw), "utf8")
        .digest("hex");
}

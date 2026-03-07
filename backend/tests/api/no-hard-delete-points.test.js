// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.resolve(__dirname, "../../api");
const JS_FILE_RE = /\.js$/i;
const HARD_DELETE_RE = /\bdelete\s+from\s+points\b/i;

async function collectFiles(rootDir) {
    const entries = await readdir(rootDir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const fullPath = path.join(rootDir, entry.name);
        if (entry.isDirectory()) {
            files.push(...(await collectFiles(fullPath)));
            continue;
        }
        if (entry.isFile() && JS_FILE_RE.test(entry.name)) {
            files.push(fullPath);
        }
    }
    return files;
}

describe("backend api guard", () => {
    it("does not use hard delete from points table", async () => {
        const files = await collectFiles(API_ROOT);
        const violations = [];

        for (const filePath of files) {
            const text = await readFile(filePath, "utf8");
            if (HARD_DELETE_RE.test(text)) {
                violations.push(path.relative(API_ROOT, filePath));
            }
        }

        expect(violations, `Found hard delete from points in: ${violations.join(", ")}`).toEqual([]);
    });
});

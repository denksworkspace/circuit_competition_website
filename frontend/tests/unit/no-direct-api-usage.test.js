import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(__dirname, "../../src");
const JS_FILE_RE = /\.(js|jsx)$/i;
const FORBIDDEN_PATTERNS = [
    "/api/points-direct",
    "/api/points-upload-url-direct",
    "VITE_DIRECT_API_BASE_URL",
];

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

describe("frontend source guard", () => {
    it("does not use deprecated direct points API routes", async () => {
        const files = await collectFiles(SRC_ROOT);
        const violations = [];

        for (const filePath of files) {
            const text = await readFile(filePath, "utf8");
            const matched = FORBIDDEN_PATTERNS.find((pattern) => text.includes(pattern));
            if (!matched) continue;
            violations.push(`${path.relative(SRC_ROOT, filePath)} -> ${matched}`);
        }

        expect(violations, `Found deprecated direct API usage in: ${violations.join(", ")}`).toEqual([]);
    });
});

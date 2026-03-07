import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.resolve(__dirname, "../../api");
const JS_FILE_RE = /\.js$/i;

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

describe("backend api lifecycle_status guard", () => {
    it("requires ensurePointsStatusConstraint in files that access lifecycle_status", async () => {
        const files = await collectFiles(API_ROOT);
        const violations = [];

        for (const filePath of files) {
            const relative = path.relative(API_ROOT, filePath);
            if (relative === "_lib/pointsStatus.js") continue;
            const text = await readFile(filePath, "utf8");
            if (!text.includes("lifecycle_status")) continue;
            if (text.includes("ensurePointsStatusConstraint")) continue;
            violations.push(relative);
        }

        expect(violations, `Missing ensurePointsStatusConstraint in: ${violations.join(", ")}`).toEqual([]);
    });
});

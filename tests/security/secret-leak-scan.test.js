import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const PLACEHOLDER_DB_URIS = new Set([
    "postgresql://USER:PASSWORD@HOST:5432/DB?sslmode=require",
]);

const PLACEHOLDER_VALUES = new Set([
    "",
    "PASSWORD",
    "YOUR_VALUE_HERE",
    "CHANGEME",
    "REPLACE_ME",
]);

const ROOT = process.cwd();
const DIR_EXCLUDES = new Set([
    ".git",
    "node_modules",
    "dist",
    "coverage",
    ".vercel",
    ".idea",
    ".vscode",
]);

function listRepoFiles(dir = ROOT) {
    const out = [];
    const entries = readdirSync(dir);
    for (const name of entries) {
        if (DIR_EXCLUDES.has(name)) continue;
        const abs = path.join(dir, name);
        const st = statSync(abs);
        if (st.isDirectory()) {
            out.push(...listRepoFiles(abs));
            continue;
        }
        out.push(path.relative(ROOT, abs));
    }
    return out;
}

function readUtf8(path) {
    try {
        return readFileSync(path, "utf8");
    } catch {
        return null;
    }
}

function isExampleOrTest(path) {
    return path === ".env.example" || path.startsWith("tests/");
}

function isIgnoredSecretLocalEnv(path) {
    return path.startsWith(".env") && path !== ".env.example";
}

function collectFindings() {
    const findings = [];
    const files = listRepoFiles();

    for (const file of files) {
        if (isIgnoredSecretLocalEnv(file)) continue;
        const content = readUtf8(file);
        if (content == null) continue;
        const lines = content.split(/\r?\n/);

        for (let i = 0; i < lines.length; i += 1) {
            const line = lines[i];
            const lineNo = i + 1;

            for (const match of line.matchAll(/postgres(?:ql)?:\/\/[^\s"'`]+/gi)) {
                const uri = match[0];
                if (PLACEHOLDER_DB_URIS.has(uri)) continue;
                if (uri.includes("<") || uri.includes(">")) continue;
                if (isExampleOrTest(file)) continue;
                findings.push(`${file}:${lineNo} leaked DB URI`);
            }

            for (const match of line.matchAll(/\bnpg_[A-Za-z0-9]{8,}\b/g)) {
                if (isExampleOrTest(file)) continue;
                findings.push(`${file}:${lineNo} leaked Neon password/token (${match[0].slice(0, 12)}...)`);
            }

            const oidc = line.match(/\bVERCEL_OIDC_TOKEN\s*=\s*["']?([^"'\s]+)["']?/);
            if (oidc) {
                const value = oidc[1] || "";
                if (!PLACEHOLDER_VALUES.has(value) && !isExampleOrTest(file)) {
                    findings.push(`${file}:${lineNo} leaked VERCEL_OIDC_TOKEN`);
                }
            }

            const pgPass = line.match(/\bPOSTGRES_PASSWORD\s*=\s*["']?([^"'\s]+)["']?/);
            if (pgPass) {
                const value = pgPass[1] || "";
                if (!PLACEHOLDER_VALUES.has(value) && !isExampleOrTest(file)) {
                    findings.push(`${file}:${lineNo} leaked POSTGRES_PASSWORD`);
                }
            }
        }
    }

    return findings;
}

describe("security: repository secret scan", () => {
    it("does not contain committed database credentials or tokens", () => {
        const findings = collectFindings();
        expect(findings).toEqual([]);
    });
});

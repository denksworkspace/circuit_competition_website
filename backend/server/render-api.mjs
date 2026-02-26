import http from "node:http";
import path from "node:path";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(serverDir, "../api");
const repoRootDir = path.resolve(serverDir, "../..");
const handlerCache = new Map();
const MAX_BODY_BYTES = 20 * 1024 * 1024;

function stripQuotes(value) {
    if (value.length < 2) return value;
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === "\"" && last === "\"") || (first === "'" && last === "'")) {
        return value.slice(1, -1);
    }
    return value;
}

async function loadEnvFile(filePath) {
    try {
        const raw = await readFile(filePath, "utf8");
        for (const line of raw.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) continue;
            const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
            if (!match) continue;
            const key = match[1];
            if (process.env[key] != null) continue;
            process.env[key] = stripQuotes(match[2].trim());
        }
    } catch {
        // Optional env file: skip silently when missing.
    }
}

async function bootstrapEnv() {
    await loadEnvFile(path.join(repoRootDir, ".env.local"));
    await loadEnvFile(path.join(repoRootDir, ".env"));
    await loadEnvFile(path.join(path.resolve(serverDir, ".."), ".env.local"));
    await loadEnvFile(path.join(path.resolve(serverDir, ".."), ".env"));

    // @vercel/postgres expects POSTGRES_URL. On non-Vercel hosts we often only have DATABASE_URL.
    if (!process.env.POSTGRES_URL && process.env.DATABASE_URL) {
        process.env.POSTGRES_URL = process.env.DATABASE_URL;
    }
}

function setCorsHeaders(res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

async function getHandler(name) {
    if (handlerCache.has(name)) return handlerCache.get(name);

    const filePath = path.join(apiDir, `${name}.js`);
    try {
        await access(filePath);
    } catch {
        return null;
    }

    const moduleUrl = pathToFileURL(filePath).href;
    const mod = await import(moduleUrl);
    const handler = mod?.default;
    if (typeof handler !== "function") return null;

    handlerCache.set(name, handler);
    return handler;
}

function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let received = 0;
        const chunks = [];

        req.on("data", (chunk) => {
            received += chunk.length;
            if (received > MAX_BODY_BYTES) {
                reject(new Error("Body too large"));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });

        req.on("end", () => {
            if (chunks.length === 0) {
                resolve({});
                return;
            }

            const raw = Buffer.concat(chunks).toString("utf8").trim();
            if (!raw) {
                resolve({});
                return;
            }

            try {
                resolve(JSON.parse(raw));
            } catch {
                reject(new Error("Invalid JSON"));
            }
        });

        req.on("error", reject);
    });
}

function augmentResponse(res) {
    res.status = function status(code) {
        this.statusCode = code;
        return this;
    };

    res.json = function json(payload) {
        if (!this.headersSent) {
            this.setHeader("Content-Type", "application/json; charset=utf-8");
        }
        this.end(JSON.stringify(payload));
    };

    res.send = function send(payload) {
        if (payload == null) {
            this.end("");
            return;
        }
        if (typeof payload === "object") {
            this.json(payload);
            return;
        }
        this.end(String(payload));
    };

    return res;
}

const server = http.createServer(async (req, res) => {
    try {
        setCorsHeaders(res);
        const requestAbortController = new AbortController();
        req.on("aborted", () => {
            requestAbortController.abort();
        });
        res.on("close", () => {
            // If the response stream closes before the response is ended,
            // the client disconnected and ongoing work should be aborted.
            if (!res.writableEnded) requestAbortController.abort();
        });

        if (!req.url) {
            res.statusCode = 400;
            res.end("Bad request");
            return;
        }

        const url = new URL(req.url, "http://localhost");

        if (req.method === "OPTIONS") {
            res.statusCode = 204;
            res.end();
            return;
        }

        if (url.pathname === "/health") {
            augmentResponse(res).json({ ok: true });
            return;
        }

        const match = url.pathname.match(/^\/api\/([a-zA-Z0-9_-]+)$/);
        if (!match) {
            res.statusCode = 404;
            augmentResponse(res).json({ error: "Not found." });
            return;
        }

        const handler = await getHandler(match[1]);
        if (!handler) {
            res.statusCode = 404;
            augmentResponse(res).json({ error: "Not found." });
            return;
        }

        const reqAny = req;
        reqAny.query = Object.fromEntries(url.searchParams.entries());
        reqAny.abortSignal = requestAbortController.signal;

        if (req.method && ["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) {
            try {
                reqAny.body = await readJsonBody(req);
            } catch (error) {
                const message = String(error?.message || "Invalid request body.");
                const code = message === "Body too large" ? 413 : 400;
                augmentResponse(res).status(code).json({ error: message });
                return;
            }
        } else {
            reqAny.body = {};
        }

        const resAny = augmentResponse(res);
        await handler(reqAny, resAny);
    } catch (error) {
        console.error(error);
        if (!res.headersSent) {
            augmentResponse(res).status(500).json({ error: "Internal error." });
        }
    }
});

await bootstrapEnv();

const port = Number(process.env.PORT || 3000);
server.listen(port, () => {
    console.log(`Backend listening on :${port}`);
});

const MAX_QUEUE_SIZE = 200;
const FLUSH_INTERVAL_MS = 5000;
const LOG_ENDPOINT_PATH = "/api/site-activity-log";

let loggerStarted = false;
let fetchPatched = false;
let queue = [];
let flushTimer = null;
const sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

function nowIso() {
    return new Date().toISOString();
}

function getPagePath() {
    if (typeof window === "undefined" || !window.location) return "";
    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function toTrimmed(valueRaw, maxLen) {
    const value = String(valueRaw || "").trim();
    if (!value) return "";
    return value.slice(0, maxLen);
}

function normalizeDetails(detailsRaw) {
    if (detailsRaw == null || typeof detailsRaw !== "object") return null;
    try {
        return JSON.parse(JSON.stringify(detailsRaw));
    } catch {
        return null;
    }
}

function pushActivity(eventType, details = null, source = "frontend") {
    const type = toTrimmed(eventType, 100);
    if (!type) return;
    queue.push({
        eventType: type,
        source: toTrimmed(source, 100),
        pagePath: toTrimmed(getPagePath(), 400),
        sessionId,
        clientTimestamp: nowIso(),
        details: normalizeDetails(details),
    });
    if (queue.length > MAX_QUEUE_SIZE) {
        queue = queue.slice(queue.length - MAX_QUEUE_SIZE);
    }
    if (queue.length >= 20) flushNow();
}

function shouldLogFetchUrl(urlRaw) {
    const url = String(urlRaw || "");
    if (!url) return false;
    if (url.includes(LOG_ENDPOINT_PATH)) return false;
    if (url.includes("/api/maintenance-status")) return false;
    return url.includes("/api/");
}

async function sendBatch(events) {
    if (!Array.isArray(events) || events.length === 0) return;
    const url = LOG_ENDPOINT_PATH;
    const payload = JSON.stringify({ events });
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        const sent = navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
        if (sent) return;
    }
    await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-site-activity-no-log": "1" },
        body: payload,
        keepalive: true,
    });
}

export async function flushNow() {
    if (queue.length === 0) return;
    const events = queue;
    queue = [];
    try {
        await sendBatch(events);
    } catch {
        // Logging must never break UI actions.
    }
}

function scheduleFlush() {
    if (flushTimer != null || typeof window === "undefined") return;
    flushTimer = window.setInterval(() => {
        void flushNow();
    }, FLUSH_INTERVAL_MS);
}

function installFetchPatch() {
    if (fetchPatched || typeof window === "undefined" || typeof window.fetch !== "function") return;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
        const input = args[0];
        const url = typeof input === "string" ? input : String(input?.url || "");
        const shouldLog = shouldLogFetchUrl(url);
        const startedAt = Date.now();
        if (shouldLog) {
            pushActivity("api_request_start", {
                method: toTrimmed(args[1]?.method || "GET", 20),
                url: toTrimmed(url, 500),
            }, "http");
        }
        try {
            const response = await originalFetch(...args);
            if (shouldLog) {
                pushActivity("api_request_finish", {
                    method: toTrimmed(args[1]?.method || "GET", 20),
                    url: toTrimmed(url, 500),
                    status: Number(response.status || 0),
                    ok: Boolean(response.ok),
                    durationMs: Date.now() - startedAt,
                }, "http");
            }
            return response;
        } catch (error) {
            if (shouldLog) {
                pushActivity("api_request_error", {
                    method: toTrimmed(args[1]?.method || "GET", 20),
                    url: toTrimmed(url, 500),
                    durationMs: Date.now() - startedAt,
                    message: toTrimmed(error?.message || "Fetch failed", 500),
                }, "http");
            }
            throw error;
        }
    };
    fetchPatched = true;
}

function installDomListeners() {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    window.addEventListener("error", (event) => {
        pushActivity("js_error", {
            message: toTrimmed(event?.message || "", 500),
            file: toTrimmed(event?.filename || "", 400),
            line: Number(event?.lineno || 0),
            col: Number(event?.colno || 0),
        }, "window");
    });
    window.addEventListener("unhandledrejection", (event) => {
        const reason = event?.reason;
        pushActivity("promise_rejection", {
            message: toTrimmed(reason?.message || String(reason || ""), 500),
        }, "window");
    });
    window.addEventListener("pagehide", () => {
        pushActivity("page_hide", null, "navigation");
        void flushNow();
    });
    window.addEventListener("beforeunload", () => {
        pushActivity("before_unload", null, "navigation");
        void flushNow();
    });
    window.addEventListener("popstate", () => {
        pushActivity("navigation_popstate", null, "navigation");
    });
    document.addEventListener("visibilitychange", () => {
        pushActivity(document.visibilityState === "hidden" ? "page_hidden" : "page_visible", null, "navigation");
    });
    document.addEventListener("click", (event) => {
        const el = event.target instanceof Element ? event.target : null;
        if (!el) return;
        pushActivity("ui_click", {
            tag: toTrimmed(el.tagName || "", 40),
            id: toTrimmed(el.id || "", 120),
            className: toTrimmed(el.className || "", 200),
            text: toTrimmed(el.textContent || "", 160),
        }, "ui");
    }, true);
    document.addEventListener("submit", (event) => {
        const el = event.target instanceof HTMLFormElement ? event.target : null;
        if (!el) return;
        pushActivity("ui_submit", {
            id: toTrimmed(el.id || "", 120),
            className: toTrimmed(el.className || "", 200),
        }, "ui");
    }, true);
    document.addEventListener("change", (event) => {
        const el = event.target instanceof Element ? event.target : null;
        if (!el) return;
        pushActivity("ui_change", {
            tag: toTrimmed(el.tagName || "", 40),
            id: toTrimmed(el.id || "", 120),
            className: toTrimmed(el.className || "", 200),
        }, "ui");
    }, true);
}

export function startSiteActivityLogger() {
    if (loggerStarted) return;
    loggerStarted = true;
    pushActivity("app_start", {
        userAgent: toTrimmed(typeof navigator !== "undefined" ? navigator.userAgent : "", 300),
    }, "app");
    scheduleFlush();
    installFetchPatch();
    installDomListeners();
}

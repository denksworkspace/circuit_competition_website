import { sql } from "@vercel/postgres";
import runUploadRequestHandler from "../api/points-upload-request-run.js";

const ACTIVE_REQUEST_STATUSES = new Set(["queued", "processing"]);
const IDLE_CHECK_MS = Math.max(60 * 1000, Number(process.env.UPLOAD_QUEUE_IDLE_CHECK_MS || 60 * 60 * 1000));
const MAX_STEPS_PER_REQUEST = Math.max(10, Number(process.env.UPLOAD_QUEUE_MAX_STEPS_PER_REQUEST || 20000));

let workerRunning = false;
let idleTimer = null;

function toStatus(value) {
    return String(value || "").trim().toLowerCase();
}

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function scheduleIdleCheck() {
    if (idleTimer) {
        clearTimeout(idleTimer);
    }
    idleTimer = setTimeout(() => {
        void runQueueWorker("idle-check");
    }, IDLE_CHECK_MS);
}

async function findOldestActiveRequest() {
    const result = await sql`
      select upload_requests.id, commands.auth_key
      from upload_requests
      join commands on commands.id = upload_requests.command_id
      where lower(coalesce(upload_requests.status, '')) in ('queued', 'processing')
      order by
        case when lower(coalesce(upload_requests.status, '')) = 'processing' then 0 else 1 end asc,
        upload_requests.created_at asc
      limit 1
    `;
    if (result.rows.length === 0) return null;
    return {
        requestId: String(result.rows[0].id || ""),
        authKey: String(result.rows[0].auth_key || ""),
    };
}

async function runRequestStep({ requestId, authKey }) {
    let statusCode = 200;
    let payload = null;
    let ended = false;
    const res = {
        status(code) {
            statusCode = Number(code) || 200;
            return this;
        },
        json(body) {
            payload = body;
            ended = true;
            return this;
        },
        setHeader() {},
        end() {
            ended = true;
            return this;
        },
    };
    const req = {
        method: "POST",
        headers: { host: "queue-worker.local" },
        urlPath: "/api/points-upload-request-run",
        body: {
            authKey,
            requestId,
        },
    };
    await runUploadRequestHandler(req, res);
    if (!ended) {
        throw new Error("Queue run step did not return a response.");
    }
    if (statusCode >= 400) {
        throw new Error(`Queue run step failed with HTTP ${statusCode}.`);
    }
    return payload || {};
}

async function processRequestUntilSettled(activeRequest) {
    let steps = 0;
    while (steps < MAX_STEPS_PER_REQUEST) {
        const snapshot = await runRequestStep(activeRequest);
        const nextStatus = toStatus(snapshot?.request?.status);
        if (!ACTIVE_REQUEST_STATUSES.has(nextStatus)) {
            return;
        }
        steps += 1;
        // Yield to the event loop so API requests are still served smoothly.
        await sleep(0);
    }
    throw new Error(`Queue worker reached step limit (${MAX_STEPS_PER_REQUEST}) for request ${activeRequest.requestId}.`);
}

async function runQueueWorker(trigger) {
    if (workerRunning) return;
    workerRunning = true;
    if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
    }
    try {
        // Drain active queue fully before returning to idle hourly checks.
        // This guarantees processing continues even with no users on the site.
        while (true) {
            const activeRequest = await findOldestActiveRequest();
            if (!activeRequest || !activeRequest.requestId || !activeRequest.authKey) {
                break;
            }
            await processRequestUntilSettled(activeRequest);
        }
    } catch (error) {
        console.error(`[queue-worker:${trigger}]`, error);
    } finally {
        workerRunning = false;
        scheduleIdleCheck();
    }
}

export function startUploadQueueWorker() {
    void runQueueWorker("startup");
}

export function kickUploadQueueWorker() {
    void runQueueWorker("kick");
}

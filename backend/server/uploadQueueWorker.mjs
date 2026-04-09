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

async function listActiveRequests() {
    const result = await sql`
      select upload_requests.id, commands.auth_key
      from public.upload_requests
      join public.commands on commands.id = upload_requests.command_id
      where lower(coalesce(upload_requests.status, '')) in ('queued', 'processing')
      order by
        case when lower(coalesce(upload_requests.status, '')) = 'processing' then 0 else 1 end asc,
        upload_requests.created_at asc
    `;
    if (result.rows.length === 0) return [];
    return result.rows.map((row) => ({
        requestId: String(row.id || ""),
        authKey: String(row.auth_key || ""),
    })).filter((row) => row.requestId && row.authKey);
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
            responseMode: "request_only",
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

async function runQueueWorker(trigger) {
    if (workerRunning) return;
    workerRunning = true;
    if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
    }
    try {
        const requestStepCounts = new Map();
        // Fair scheduling: one run step per active request in each round.
        // This prevents a single long request from starving other active requests.
        while (true) {
            const activeRequests = await listActiveRequests();
            if (!Array.isArray(activeRequests) || activeRequests.length < 1) {
                break;
            }

            const activeIds = new Set(activeRequests.map((row) => row.requestId));
            for (const requestId of Array.from(requestStepCounts.keys())) {
                if (!activeIds.has(requestId)) {
                    requestStepCounts.delete(requestId);
                }
            }

            for (const activeRequest of activeRequests) {
                const requestId = String(activeRequest?.requestId || "");
                if (!requestId) continue;
                const steps = Number(requestStepCounts.get(requestId) || 0) + 1;
                if (steps > MAX_STEPS_PER_REQUEST) {
                    throw new Error(`Queue worker reached step limit (${MAX_STEPS_PER_REQUEST}) for request ${requestId}.`);
                }
                requestStepCounts.set(requestId, steps);

                const snapshot = await runRequestStep(activeRequest);
                const nextStatus = toStatus(snapshot?.request?.status);
                if (!ACTIVE_REQUEST_STATUSES.has(nextStatus)) {
                    requestStepCounts.delete(requestId);
                }
                // Yield to the event loop so API requests are still served smoothly.
                await sleep(0);
            }
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

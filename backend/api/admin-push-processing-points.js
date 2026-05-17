// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";
import { ensureCommandRolesSchema, ROLE_ADMIN } from "./_roles.js";
import { parseBody, rejectMethod } from "./_lib/http.js";
import { ensureUploadQueueSchema } from "./_lib/uploadQueue.js";
import { requeueAllStuckProcessingFiles } from "./_lib/uploadQueueOps.js";
import { setVerifyProgress } from "./_lib/verifyProgress.js";

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["POST"])) return;

    const body = parseBody(req);
    const authKey = String(body?.authKey || "").trim();
    const progressToken = String(body?.progressToken || "").trim();
    const report = (status, patch = {}) => setVerifyProgress(progressToken, { status, ...patch });
    report("queued", { done: false, error: null, doneCount: 0, totalCount: 0, currentFileName: "" });
    if (!authKey) {
        res.status(401).json({ error: "Missing auth key." });
        return;
    }

    await ensureCommandRolesSchema();
    await ensureUploadQueueSchema();

    const authRes = await sql`
      select id, role
      from public.commands
      where auth_key = ${authKey}
      limit 1
    `;
    if (authRes.rows.length === 0) {
        res.status(401).json({ error: "Invalid auth key." });
        return;
    }
    if (String(authRes.rows[0].role || "").toLowerCase() !== ROLE_ADMIN) {
        res.status(403).json({ error: "Only admin can push processing queue points." });
        return;
    }

    const pushed = await requeueAllStuckProcessingFiles({
        onProgress: ({ doneCount, totalCount, currentRequestId }) => {
            report("requeue_processing", {
                done: false,
                error: null,
                doneCount,
                totalCount,
                currentFileName: currentRequestId || "",
            });
        },
    });
    res.status(200).json({
        ok: true,
        requeuedFiles: Number(pushed.requeuedCount || 0),
        requests: Number(pushed.requestCount || 0),
        requestIds: Array.isArray(pushed.requestIds) ? pushed.requestIds : [],
    });
    report("done", {
        done: true,
        error: null,
        doneCount: Number(pushed.requestCount || 0),
        totalCount: Number(pushed.requestCount || 0),
        currentFileName: "",
    });
}

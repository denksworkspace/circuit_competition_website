// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { ensureCommandRolesSchema } from "./_roles.js";
import { rejectMethod } from "./_lib/http.js";
import { ensureUploadQueueSchema } from "./_lib/uploadQueue.js";
import { findLatestBlockingUploadRequest, getCommandByAuthKey, loadUploadRequestSnapshot } from "./_lib/uploadQueueOps.js";

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["GET"])) return;
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    const authKey = String(req?.query?.authKey || "").trim();
    if (!authKey) {
        res.status(401).json({ error: "Missing auth key." });
        return;
    }

    await ensureCommandRolesSchema();
    await ensureUploadQueueSchema();
    const command = await getCommandByAuthKey(authKey);
    if (!command) {
        res.status(401).json({ error: "Invalid auth key." });
        return;
    }

    const active = await findLatestBlockingUploadRequest(command.id);
    if (!active) {
        res.status(200).json({ request: null, files: [] });
        return;
    }
    const snapshot = await loadUploadRequestSnapshot({
        requestId: String(active.id),
        commandId: command.id,
        includeFiles: true,
    });
    if (!snapshot) {
        res.status(200).json({ request: null, files: [] });
        return;
    }
    res.status(200).json({
        request: snapshot.request,
        files: snapshot.files,
    });
}

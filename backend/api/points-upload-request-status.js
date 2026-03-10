// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { ensureCommandRolesSchema } from "./_roles.js";
import { rejectMethod } from "./_lib/http.js";
import { ensureUploadQueueSchema } from "./_lib/uploadQueue.js";
import { getCommandByAuthKey, loadUploadRequestSnapshot } from "./_lib/uploadQueueOps.js";

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["GET"])) return;
    const authKey = String(req?.query?.authKey || "").trim();
    const requestId = String(req?.query?.requestId || "").trim();
    if (!authKey) {
        res.status(401).json({ error: "Missing auth key." });
        return;
    }
    if (!requestId) {
        res.status(400).json({ error: "Missing requestId." });
        return;
    }

    await ensureCommandRolesSchema();
    await ensureUploadQueueSchema();
    const command = await getCommandByAuthKey(authKey);
    if (!command) {
        res.status(401).json({ error: "Invalid auth key." });
        return;
    }

    const snapshot = await loadUploadRequestSnapshot({
        requestId,
        commandId: command.id,
        includeFiles: true,
    });
    if (!snapshot) {
        res.status(404).json({ error: "Upload request not found." });
        return;
    }
    res.status(200).json({
        request: snapshot.request,
        files: snapshot.files,
    });
}

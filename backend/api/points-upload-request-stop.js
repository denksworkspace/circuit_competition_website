// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";
import { ensureCommandRolesSchema } from "./_roles.js";
import { parseBody, rejectMethod } from "./_lib/http.js";
import { ensureUploadQueueSchema } from "./_lib/uploadQueue.js";
import { getCommandByAuthKey, loadUploadRequestSnapshot, markRemainingAsNonProcessed } from "./_lib/uploadQueueOps.js";

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["POST"])) return;
    const body = parseBody(req);
    const authKey = String(body?.authKey || "").trim();
    const requestId = String(body?.requestId || "").trim();
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
        includeFiles: false,
    });
    if (!snapshot) {
        res.status(404).json({ error: "Upload request not found." });
        return;
    }

    await sql`
      update upload_requests
      set stop_requested = true,
          error = case
              when lower(coalesce(status, '')) in ('failed', 'closed', 'completed', 'interrupted') then error
              else 'Upload was interrupted by user.'
          end,
          updated_at = now()
      where id = ${requestId}
        and command_id = ${command.id}
    `;
    await markRemainingAsNonProcessed(requestId, {
        includeProcessing: true,
        reason: "Upload was interrupted by user.",
    });
    const ready = await loadUploadRequestSnapshot({
        requestId,
        commandId: command.id,
        includeFiles: true,
    });
    res.status(200).json(ready);
}

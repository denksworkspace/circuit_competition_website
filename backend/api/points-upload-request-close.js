// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";
import { ensureCommandRolesSchema } from "./_roles.js";
import { parseBody, rejectMethod } from "./_lib/http.js";
import { REQUEST_STATUS_CLOSED, ensureUploadQueueSchema } from "./_lib/uploadQueue.js";
import { getCommandByAuthKey, loadUploadRequestSnapshot, refreshUploadRequestCounters } from "./_lib/uploadQueueOps.js";

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
        includeFiles: true,
        commandName: command.name,
    });
    if (!snapshot) {
        res.status(404).json({ error: "Upload request not found." });
        return;
    }

    await sql`
      update upload_request_files
      set can_apply = false,
          default_checked = false,
          updated_at = now()
      where request_id = ${requestId}
        and applied = false
    `;
    await refreshUploadRequestCounters(requestId);
    await sql`
      update upload_requests
      set status = case
            when lower(coalesce(status, '')) in ('waiting_manual_verdict', 'completed', 'interrupted', 'failed', 'closed')
                then ${REQUEST_STATUS_CLOSED}
            else status
          end,
          stop_requested = false,
          current_phase = '',
          current_file_name = '',
          finished_at = coalesce(finished_at, now()),
          updated_at = now()
      where id = ${requestId}
    `;

    const ready = await loadUploadRequestSnapshot({
        requestId,
        commandId: command.id,
        includeFiles: true,
        commandName: command.name,
    });
    res.status(200).json(ready);
}

// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { ensureCommandRolesSchema } from "./_roles.js";
import { parseBody, rejectMethod } from "./_lib/http.js";
import { ensureCommandUploadSettingsSchema } from "./_lib/commandUploadSettings.js";
import { handleGetAdminUser } from "./_lib/adminUsers/getAdminUser.js";
import { handleUpdateAdminUser } from "./_lib/adminUsers/updateAdminUser.js";

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["GET", "PATCH"])) return;

    await ensureCommandRolesSchema();
    await ensureCommandUploadSettingsSchema();

    if (req.method === "GET") {
        await handleGetAdminUser(req, res);
        return;
    }

    const body = parseBody(req);
    await handleUpdateAdminUser(req, res, body);
}

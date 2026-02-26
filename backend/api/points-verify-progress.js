// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { getVerifyProgress } from "./_lib/verifyProgress.js";
import { rejectMethod } from "./_lib/http.js";

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["GET"])) return;

    const token = String(req?.query?.token || "").trim();
    if (!token) {
        res.status(400).json({ error: "Missing token." });
        return;
    }

    const row = getVerifyProgress(token);
    if (!row) {
        res.status(404).json({ error: "Progress not found." });
        return;
    }

    res.status(200).json({
        ok: true,
        status: String(row.status || "queued"),
        done: Boolean(row.done),
        error: row.error ? String(row.error) : null,
        updatedAt: Number(row.updatedAt || Date.now()),
    });
}

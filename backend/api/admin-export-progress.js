// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { rejectMethod } from "./_lib/http.js";
import { getExportProgress } from "./_lib/exportProgress.js";

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["GET"])) return;

    const token = String(req?.query?.token || "").trim();
    if (!token) {
        res.status(400).json({ error: "Missing token." });
        return;
    }

    const row = getExportProgress(token);
    if (!row) {
        res.status(404).json({ error: "Progress not found." });
        return;
    }

    res.status(200).json({
        ok: true,
        type: String(row.type || "export"),
        status: String(row.status || "queued"),
        unit: String(row.unit || "items"),
        done: Math.max(0, Number(row.done || 0)),
        total: Math.max(0, Number(row.total || 0)),
        doneFlag: Boolean(row.doneFlag),
        error: row.error ? String(row.error) : null,
        updatedAt: Number(row.updatedAt || Date.now()),
    });
}

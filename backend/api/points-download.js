// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";
import { rejectMethod } from "./_lib/http.js";
import { buildDownloadUrl } from "./_lib/points.js";
import { ensurePointsStatusConstraint } from "./_lib/pointsStatus.js";

async function fetchAsBuffer(url, signal) {
    const response = await fetch(url, signal ? { signal } : undefined);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

function sanitizeAttachmentName(fileNameRaw) {
    return String(fileNameRaw || "")
        .replace(/[\\/]/g, "_")
        .replace(/[\u0000-\u001f]/g, "_")
        .trim() || "circuit.bench";
}

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["GET"])) return;

    const authKey = String(req?.query?.authKey || "").trim();
    const pointId = String(req?.query?.pointId || "").trim();
    if (!authKey) {
        res.status(401).json({ error: "Missing auth key." });
        return;
    }
    if (!pointId) {
        res.status(400).json({ error: "Missing pointId." });
        return;
    }

    await ensurePointsStatusConstraint();
    const authRes = await sql`
      select id
      from commands
      where auth_key = ${authKey}
      limit 1
    `;
    if (authRes.rows.length === 0) {
        res.status(401).json({ error: "Invalid auth key." });
        return;
    }

    const pointRes = await sql`
      select file_name
      from points
      where id = ${pointId}
        and lower(coalesce(lifecycle_status, 'main')) <> 'deleted'
      limit 1
    `;
    if (pointRes.rows.length === 0) {
        res.status(404).json({ error: "Point not found." });
        return;
    }

    const fileName = String(pointRes.rows[0]?.file_name || "").trim();
    if (!fileName) {
        res.status(404).json({ error: "File does not exist." });
        return;
    }
    const downloadUrl = buildDownloadUrl(fileName);
    if (!downloadUrl) {
        res.status(500).json({ error: "Download URL is not configured." });
        return;
    }
    const fileBuffer = await fetchAsBuffer(downloadUrl, req?.abortSignal || null);
    if (!fileBuffer) {
        res.status(422).json({ error: "Failed to download point file." });
        return;
    }

    const attachmentName = sanitizeAttachmentName(fileName);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${attachmentName}"`);
    res.setHeader("Cache-Control", "no-store");
    res.end(fileBuffer);
}

// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import crypto from "node:crypto";
import { sql } from "@vercel/postgres";
import { ensureCommandRolesSchema, ROLE_ADMIN } from "./_roles.js";
import { parseBody, rejectMethod } from "./_lib/http.js";
import { downloadPointCircuitText } from "./_lib/pointVerification.js";
import { setVerifyProgress } from "./_lib/verifyProgress.js";

function normalizeCircuitTextForHash(textRaw) {
    return String(textRaw || "")
        .replace(/^\uFEFF/, "")
        .replace(/\r\n?/g, "\n")
        .trimEnd();
}

function sha256Hex(textRaw) {
    return crypto
        .createHash("sha256")
        .update(normalizeCircuitTextForHash(textRaw), "utf8")
        .digest("hex");
}

function normalizeResolutions(rawResolutions) {
    const input = Array.isArray(rawResolutions) ? rawResolutions : [];
    return input
        .map((item) => ({
            keepPointId: String(item?.keepPointId || "").trim(),
            removePointIds: Array.isArray(item?.removePointIds)
                ? item.removePointIds.map((id) => String(id || "").trim()).filter(Boolean)
                : [],
        }))
        .filter((item) => item.keepPointId && item.removePointIds.length > 0);
}

async function ensureAdminByAuthKey(authKey) {
    await ensureCommandRolesSchema();
    const authRes = await sql`
      select id, role
      from commands
      where auth_key = ${authKey}
      limit 1
    `;
    if (authRes.rows.length === 0) return { ok: false, status: 401, error: "Invalid auth key." };
    if (String(authRes.rows[0].role || "").toLowerCase() !== ROLE_ADMIN) {
        return { ok: false, status: 403, error: "Only admin can run identical-points audit." };
    }
    return { ok: true, adminId: Number(authRes.rows[0].id) };
}

async function scanIdenticalGroups(req, res, report) {
    const pointsRes = await sql`
      select id, benchmark, delay, area, sender, file_name, created_at
      from points
      where benchmark <> 'test'
      order by created_at desc
    `;

    const byHash = new Map();
    const failures = [];
    const log = [];
    let scanned = 0;
    const totalCount = Number(pointsRes.rows.length || 0);
    report("scan", { done: false, doneCount: 0, totalCount, currentFileName: "" });

    for (const row of pointsRes.rows) {
        if (req?.abortSignal?.aborted) {
            report("cancelled", { done: true, error: "Stopped by admin." });
            return;
        }
        const pointId = String(row.id || "");
        const fileName = String(row.file_name || "");
        const benchmark = String(row.benchmark || "");
        report("scan", {
            done: false,
            doneCount: scanned + failures.length,
            totalCount,
            currentFileName: fileName,
        });
        const downloaded = await downloadPointCircuitText(fileName, { signal: req?.abortSignal || null });
        if (!downloaded.ok) {
            const reason = downloaded.reason || "Failed to download point file.";
            failures.push({
                pointId,
                fileName,
                benchmark,
                reason,
            });
            log.push({
                pointId,
                fileName,
                success: false,
                reason,
            });
            report("scan", {
                done: false,
                doneCount: scanned + failures.length,
                totalCount,
                currentFileName: fileName,
            });
            continue;
        }
        const hash = sha256Hex(downloaded.circuitText);
        const key = `${benchmark}|${hash}`;
        if (!byHash.has(key)) byHash.set(key, []);
        byHash.get(key).push({
            id: pointId,
            benchmark,
            delay: Number(row.delay),
            area: Number(row.area),
            sender: String(row.sender || ""),
            fileName,
            createdAt: row.created_at,
            hash,
        });
        log.push({
            pointId,
            fileName,
            success: true,
            reason: `hash=${hash.slice(0, 16)} benchmark=${benchmark}`,
        });
        scanned += 1;
        report("scan", {
            done: false,
            doneCount: scanned + failures.length,
            totalCount,
            currentFileName: fileName,
        });
    }

    const groups = Array.from(byHash.values())
        .filter((items) => items.length >= 2)
        .sort((a, b) => b.length - a.length)
        .map((items, index) => ({
            groupId: `dup_${index + 1}`,
            benchmark: items[0].benchmark,
            hash: items[0].hash,
            points: items
                .slice()
                .sort((a, b) => (Date.parse(String(b.createdAt || "")) || 0) - (Date.parse(String(a.createdAt || "")) || 0)),
        }));

    res.status(200).json({
        ok: true,
        scannedPoints: scanned,
        failedPoints: failures.length,
        failures,
        log,
        groups,
    });
    report("done", {
        done: true,
        error: null,
        doneCount: scanned + failures.length,
        totalCount,
        currentFileName: "",
    });
}

async function applyIdenticalResolutions(res, resolutions) {
    let deletedPoints = 0;

    for (const item of resolutions) {
        const keepId = String(item.keepPointId || "");
        const removeIds = Array.from(new Set(item.removePointIds.filter((id) => id && id !== keepId)));
        if (removeIds.length === 0) continue;
        const result = await sql`
          delete from points
          where id = any(${removeIds}::text[])
            and id <> ${keepId}
        `;
        deletedPoints += Number(result.rowCount || 0);
    }

    res.status(200).json({
        ok: true,
        deletedPoints,
        appliedGroups: resolutions.length,
    });
}

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["POST"])) return;

    const body = parseBody(req);
    const authKey = String(body?.authKey || "").trim();
    const mode = String(body?.mode || "scan").trim().toLowerCase();
    const resolutions = normalizeResolutions(body?.resolutions);
    const progressToken = String(body?.progressToken || "").trim();
    const report = (status, patch = {}) => setVerifyProgress(progressToken, { status, ...patch });
    report("queued", { done: false, error: null, doneCount: 0, totalCount: 0, currentFileName: "" });

    if (!authKey) {
        res.status(401).json({ error: "Missing auth key." });
        return;
    }

    const auth = await ensureAdminByAuthKey(authKey);
    if (!auth.ok) {
        res.status(auth.status).json({ error: auth.error });
        return;
    }

    if (mode === "apply") {
        await applyIdenticalResolutions(res, resolutions);
        report("done", { done: true, error: null });
        return;
    }

    await scanIdenticalGroups(req, res, report);
}

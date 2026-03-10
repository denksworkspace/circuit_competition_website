// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";
import { ensureCommandRolesSchema } from "./_roles.js";
import { parseBody, rejectMethod } from "./_lib/http.js";
import { checkDuplicatePointByCircuit } from "./_lib/duplicateCheck.js";

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["POST"])) return;

    const body = parseBody(req);
    const authKey = String(body?.authKey || "").trim();
    const benchmark = String(body?.benchmark || "").trim();
    const delay = Number(body?.delay);
    const area = Number(body?.area);
    const circuitText = String(body?.circuitText || "");

    if (!authKey) {
        res.status(401).json({ error: "Missing auth key." });
        return;
    }
    if (!benchmark || benchmark === "test" || !Number.isFinite(delay) || !Number.isFinite(area)) {
        res.status(400).json({ error: "Invalid benchmark/delay/area." });
        return;
    }
    if (!circuitText) {
        res.status(400).json({ error: "Missing circuit text." });
        return;
    }

    await ensureCommandRolesSchema();
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

    const duplicateResult = await checkDuplicatePointByCircuit({
        benchmark,
        delay,
        area,
        circuitText,
    });
    if (duplicateResult.blockedByCheckError) {
        res.status(422).json({
            error: duplicateResult.errorReason || "Failed to verify duplicates against existing points.",
            code: "DUPLICATE_CHECK_IO_FAILED",
        });
        return;
    }
    res.status(200).json({
        duplicate: Boolean(duplicateResult.duplicate),
        point: duplicateResult.point || null,
    });
}

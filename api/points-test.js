// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";
import { ensureCommandRolesSchema, ROLE_ADMIN } from "./_roles.js";
import { parseBody, rejectMethod } from "./_lib/http.js";
import { runCecBenchTexts } from "./_lib/abc.js";
import { getTruthTableByBenchmark } from "./_lib/truthTables.js";

async function loadReferenceTruthText(benchmark) {
    const truth = await getTruthTableByBenchmark(benchmark);
    if (!truth || !truth.downloadUrl) {
        throw new Error(`Truth file not found for benchmark ${benchmark}.`);
    }
    const response = await fetch(truth.downloadUrl);
    if (!response.ok) {
        throw new Error(`Failed to download truth file for benchmark ${benchmark}.`);
    }
    return await response.text();
}

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["POST"])) return;

    const body = parseBody(req);
    const authKey = String(body?.authKey || "").trim();
    const benchmark = String(body?.benchmark || "").trim();
    const circuitText = String(body?.circuitText || "");
    const fileName = String(body?.fileName || "").trim();

    if (!authKey) {
        res.status(401).json({ error: "Missing auth key." });
        return;
    }
    if (!benchmark || benchmark === "test") {
        res.status(400).json({ error: "Only numeric benchmarks can be tested with CEC." });
        return;
    }
    if (!circuitText) {
        res.status(400).json({ error: "Missing circuit text." });
        return;
    }

    await ensureCommandRolesSchema();
    const authRes = await sql`
      select id, role
      from commands
      where auth_key = ${authKey}
      limit 1
    `;
    if (authRes.rows.length === 0) {
        res.status(401).json({ error: "Invalid auth key." });
        return;
    }

    const actor = authRes.rows[0];
    if (String(actor.role || "").toLowerCase() !== ROLE_ADMIN) {
        res.status(403).json({ error: "Only admin can run CEC tests." });
        return;
    }

    let referenceBenchText;
    try {
        referenceBenchText = await loadReferenceTruthText(benchmark);
    } catch (error) {
        const message = String(error?.message || "Failed to load reference circuit.");
        const statusCode = /not found/i.test(message) ? 404 : 500;
        res.status(statusCode).json({ error: message });
        return;
    }

    const cec = await runCecBenchTexts({
        referenceBenchText,
        candidateBenchText: circuitText,
    });
    if (!cec.ok) {
        const statusCode = cec.code === "ABC_NOT_FOUND" ? 503 : 422;
        res.status(statusCode).json({
            error: cec.message || "CEC failed.",
            code: cec.code || "CEC_FAILED",
        });
        return;
    }

    res.status(200).json({
        ok: true,
        equivalent: cec.equivalent,
        benchmark,
        fileName,
        output: cec.output.slice(-1500),
    });
}

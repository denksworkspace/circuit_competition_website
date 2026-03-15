// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";
import { normalizePointRow } from "../points.js";
import { ensureTruthTablesSchema } from "../truthTables.js";
import { ensurePointsStatusConstraint } from "../pointsStatus.js";

export async function handleGetPoints(req, res) {
    const authKey = String(req?.query?.authKey || "").trim();
    if (!authKey) {
        res.status(401).json({ error: "Missing auth key." });
        return;
    }

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

    await ensureTruthTablesSchema();
    await ensurePointsStatusConstraint();
    const { rows } = await sql`
      select
        p.id,
        p.benchmark,
        p.delay,
        p.area,
        p.description,
        p.sender,
        p.file_name,
        p.status,
        p.checker_version,
        p.created_at,
        (t.benchmark is not null) as has_truth
      from points p
      left join truth_tables t on t.benchmark = p.benchmark
      where lower(coalesce(p.lifecycle_status, 'main')) <> 'deleted'
      order by p.created_at desc
    `;

    res.status(200).json({ points: rows.map(normalizePointRow) });
}

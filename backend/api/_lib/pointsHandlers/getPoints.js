// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";
import { normalizePointRow } from "../points.js";
import { ensureTruthTablesSchema } from "../truthTables.js";

export async function handleGetPoints(req, res) {
    await ensureTruthTablesSchema();
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
        (t.benchmark is not null) as has_truth
      from points p
      left join truth_tables t on t.benchmark = p.benchmark
      order by p.created_at desc
    `;

    res.status(200).json({ points: rows.map(normalizePointRow) });
}

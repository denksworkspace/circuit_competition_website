// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";
import { normalizePointRow } from "../points.js";

export async function handleGetPoints(req, res) {
    const { rows } = await sql`
      select id, benchmark, delay, area, description, sender, file_name, status, checker_version
      from points
      order by created_at desc
    `;

    res.status(200).json({ points: rows.map(normalizePointRow) });
}

import { sql } from "@vercel/postgres";

export default async function handler(req, res) {
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        res.status(405).end();
        return;
    }

    const result = await sql`
      select id, name, color
      from commands
      order by name asc
    `;

    const commands = result.rows.map((row) => ({
        id: Number(row.id),
        name: row.name,
        color: row.color,
    }));

    res.status(200).json({ commands });
}


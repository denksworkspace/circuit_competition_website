import { sql } from "@vercel/postgres";
import { applyDbEnvSelection } from "../server/dbEnvSelection.mjs";

applyDbEnvSelection();

async function migratePointsSchema() {
    await sql`begin`;
    try {
        await sql`
          alter table points
          add column if not exists lifecycle_status text
        `;
        await sql`
          alter table points
          add column if not exists content_hash text
        `;
        await sql`
          update points
          set lifecycle_status = case
            when lower(coalesce(status, '')) = 'deleted' then 'deleted'
            else 'main'
          end
          where lifecycle_status is null
             or btrim(lifecycle_status) = ''
        `;
        await sql`
          update points
          set status = 'non-verified'
          where lower(coalesce(btrim(status), '')) not in ('non-verified', 'verified', 'failed')
        `;
        await sql`
          alter table points
          alter column lifecycle_status set default 'main'
        `;
        await sql`
          alter table points
          drop constraint if exists points_lifecycle_status_check
        `;
        await sql`
          alter table points
          add constraint points_lifecycle_status_check
          check (lower(coalesce(lifecycle_status, '')) in ('main', 'deleted'))
        `;
        await sql`
          alter table points
          drop constraint if exists points_status_check
        `;
        await sql`
          alter table points
          add constraint points_status_check
          check (lower(coalesce(status, '')) in ('non-verified', 'verified', 'failed'))
        `;
        await sql`
          create index if not exists points_benchmark_content_hash_idx
          on points(benchmark, content_hash)
        `;
        await sql`commit`;
    } catch (error) {
        await sql`rollback`;
        throw error;
    }
}

async function main() {
    try {
        await migratePointsSchema();
        console.log("points schema migration: done");
    } catch (error) {
        console.error("points schema migration: failed");
        console.error(error);
        process.exitCode = 1;
    }
}

await main();

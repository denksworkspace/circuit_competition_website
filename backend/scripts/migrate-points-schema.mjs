import { sql } from "@vercel/postgres";
import { applyDbEnvSelection } from "../server/dbEnvSelection.mjs";

applyDbEnvSelection();

async function ensurePointsDuplicateGuardIndex() {
    const duplicateCheckRes = await sql`
      select benchmark, delay, area, content_hash
      from public.points
      where lower(coalesce(lifecycle_status, 'main')) <> 'deleted'
        and content_hash is not null
        and btrim(content_hash) <> ''
      group by benchmark, delay, area, content_hash
      having count(*) > 1
      limit 1
    `;
    if (duplicateCheckRes.rows.length > 0) {
        const duplicate = duplicateCheckRes.rows[0];
        console.warn("points schema migration: duplicate guard index skipped because duplicates already exist", {
            benchmark: String(duplicate?.benchmark || ""),
            delay: Number(duplicate?.delay),
            area: Number(duplicate?.area),
            contentHash: String(duplicate?.content_hash || ""),
        });
        return false;
    }
    await sql`
      create unique index if not exists points_active_duplicate_guard_uidx
      on public.points(benchmark, delay, area, content_hash)
      where lower(coalesce(lifecycle_status, 'main')) <> 'deleted'
        and content_hash is not null
        and btrim(content_hash) <> ''
    `;
    return true;
}

async function migratePointsSchema() {
    await sql`begin`;
    try {
        await sql`
          alter table public.points
          add column if not exists description text
        `;
        await sql`
          alter table public.points
          add column if not exists lifecycle_status text
        `;
        await sql`
          alter table public.points
          add column if not exists content_hash text
        `;
        await sql`
          alter table public.points
          add column if not exists manual_synthesis boolean not null default false
        `;
        await sql`
          do $$
          begin
            if exists (
              select 1
              from information_schema.columns
              where table_schema = 'public'
                and table_name = 'points'
                and column_name = 'name'
            ) then
              update public.points
              set description = coalesce(nullif(btrim(description), ''), nullif(btrim(name), ''), 'circuit')
              where description is null
                 or btrim(description) = '';
            else
              update public.points
              set description = 'circuit'
              where description is null
                 or btrim(description) = '';
            end if;
          end
          $$;
        `;
        await sql`
          update public.points
          set lifecycle_status = case
            when lower(coalesce(status, '')) = 'deleted' then 'deleted'
            else 'main'
          end
          where lifecycle_status is null
             or btrim(lifecycle_status) = ''
        `;
        await sql`
          update public.points
          set status = 'non-verified'
          where lower(coalesce(btrim(status), '')) not in ('non-verified', 'verified', 'failed')
        `;
        await sql`
          alter table public.points
          alter column description set default 'circuit'
        `;
        await sql`
          alter table public.points
          alter column lifecycle_status set default 'main'
        `;
        await sql`
          alter table public.points
          drop constraint if exists points_lifecycle_status_check
        `;
        await sql`
          alter table public.points
          add constraint points_lifecycle_status_check
          check (lower(coalesce(lifecycle_status, '')) in ('main', 'deleted'))
        `;
        await sql`
          alter table public.points
          drop constraint if exists points_status_check
        `;
        await sql`
          alter table public.points
          add constraint points_status_check
          check (lower(coalesce(status, '')) in ('non-verified', 'verified', 'failed'))
        `;
        await sql`
          create index if not exists points_benchmark_content_hash_idx
          on public.points(benchmark, content_hash)
        `;
        await ensurePointsDuplicateGuardIndex();
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

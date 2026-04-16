// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";

let pointsStatusConstraintReadyPromise = null;
let duplicateGuardIndexWarningShown = false;

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
        if (!duplicateGuardIndexWarningShown) {
            duplicateGuardIndexWarningShown = true;
            const duplicate = duplicateCheckRes.rows[0];
            console.warn(
                "points duplicate guard index skipped: existing duplicates remain",
                {
                    benchmark: String(duplicate?.benchmark || ""),
                    delay: Number(duplicate?.delay),
                    area: Number(duplicate?.area),
                    contentHash: String(duplicate?.content_hash || ""),
                }
            );
        }
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

export async function ensurePointsStatusConstraint() {
    if (!pointsStatusConstraintReadyPromise) {
        pointsStatusConstraintReadyPromise = (async () => {
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
              add column if not exists manual_synthesis boolean not null default false
            `;
            await sql`
              alter table public.points
              add column if not exists content_hash text
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
              where lower(coalesce(status, '')) in ('main', 'deleted')
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
              check (
                lower(coalesce(lifecycle_status, '')) in (
                  'main',
                  'deleted'
                )
              )
            `;
            await sql`
              alter table public.points
              drop constraint if exists points_status_check
            `;
            await sql`
              alter table public.points
              add constraint points_status_check
              check (
                lower(coalesce(status, '')) in (
                  'non-verified',
                  'verified',
                  'failed'
                )
              )
            `;
            await sql`
              create index if not exists points_benchmark_content_hash_idx
              on public.points(benchmark, content_hash)
            `;
            await ensurePointsDuplicateGuardIndex();
        })().catch((error) => {
            pointsStatusConstraintReadyPromise = null;
            throw error;
        });
    }
    return pointsStatusConstraintReadyPromise;
}

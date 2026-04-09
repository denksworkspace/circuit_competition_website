// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";

let pointsStatusConstraintReadyPromise = null;

export async function ensurePointsStatusConstraint() {
    if (!pointsStatusConstraintReadyPromise) {
        pointsStatusConstraintReadyPromise = (async () => {
            await sql`
              alter table public.points
              add column if not exists lifecycle_status text
            `;
            await sql`
              alter table public.points
              add column if not exists manual_synthesis boolean not null default false
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
        })().catch((error) => {
            pointsStatusConstraintReadyPromise = null;
            throw error;
        });
    }
    return pointsStatusConstraintReadyPromise;
}

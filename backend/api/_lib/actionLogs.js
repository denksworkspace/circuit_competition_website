// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";

let actionLogsReadyPromise = null;

export async function ensureActionLogsSchema() {
    if (!actionLogsReadyPromise) {
        actionLogsReadyPromise = (async () => {
            await sql`
              create table if not exists command_action_logs (
                id bigserial primary key,
                command_id bigint not null references commands(id) on delete cascade,
                actor_command_id bigint references commands(id) on delete set null,
                action text not null,
                details jsonb,
                created_at timestamptz not null default now()
              )
            `;

            await sql`create index if not exists command_action_logs_command_id_idx on command_action_logs(command_id, created_at desc)`;
            await sql`create index if not exists command_action_logs_actor_id_idx on command_action_logs(actor_command_id, created_at desc)`;
        })().catch((error) => {
            actionLogsReadyPromise = null;
            throw error;
        });
    }

    return actionLogsReadyPromise;
}

export async function addActionLog({ commandId, actorCommandId = null, action, details = null }) {
    await ensureActionLogsSchema();
    await sql`
      insert into command_action_logs (command_id, actor_command_id, action, details)
      values (${commandId}, ${actorCommandId}, ${action}, ${details ? JSON.stringify(details) : null}::jsonb)
    `;
}

export async function getActionLogsForCommand(commandId, limit = 100) {
    await ensureActionLogsSchema();

    const safeLimit = Math.min(500, Math.max(1, Number(limit) || 100));
    const { rows } = await sql`
      select
        l.id,
        l.command_id,
        l.actor_command_id,
        l.action,
        l.details,
        l.created_at,
        actor.name as actor_name,
        target.name as target_name
      from command_action_logs l
      left join commands actor on actor.id = l.actor_command_id
      left join commands target on target.id = l.command_id
      where l.command_id = ${commandId}
      order by l.created_at desc
      limit ${safeLimit}
    `;

    return rows.map((row) => ({
        id: Number(row.id),
        commandId: Number(row.command_id),
        actorCommandId: row.actor_command_id == null ? null : Number(row.actor_command_id),
        actorName: row.actor_name || null,
        targetName: row.target_name || null,
        action: row.action,
        details: row.details || null,
        createdAt: row.created_at,
    }));
}

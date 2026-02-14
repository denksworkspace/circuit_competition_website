// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";

export const ROLE_ADMIN = "admin";
export const ROLE_LEADER = "leader";
export const ROLE_PARTICIPANT = "participant";

export const ALLOWED_ROLES = new Set([ROLE_ADMIN, ROLE_LEADER, ROLE_PARTICIPANT]);

let rolesSchemaReadyPromise = null;

export function normalizeRole(rawRole) {
    const role = String(rawRole || "")
        .trim()
        .toLowerCase();
    if (ALLOWED_ROLES.has(role)) return role;
    return ROLE_PARTICIPANT;
}

export async function ensureCommandRolesSchema() {
    if (!rolesSchemaReadyPromise) {
        rolesSchemaReadyPromise = (async () => {
            await sql`alter table commands add column if not exists role text`;
            await sql`
              update commands
              set role = 'participant'
              where role is null
                 or btrim(role) = ''
                 or lower(role) not in ('admin', 'leader', 'participant')
            `;
            await sql`alter table commands alter column role set default 'participant'`;
        })().catch((err) => {
            rolesSchemaReadyPromise = null;
            throw err;
        });
    }
    return rolesSchemaReadyPromise;
}

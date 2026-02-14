import { sql } from "@vercel/postgres";
import { normalizeRole, ROLE_ADMIN } from "../../_roles.js";
import { normalizeCommandUploadSettings } from "../commandUploadSettings.js";

export function parsePositiveGb(raw) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return null;
    return Math.floor(value * 1024 * 1024 * 1024);
}

export function parsePositiveInt(raw) {
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1) return null;
    return value;
}

export function normalizeUserRow(row) {
    return {
        id: Number(row.id),
        name: row.name,
        color: row.color,
        role: normalizeRole(row.role),
        ...normalizeCommandUploadSettings(row),
    };
}

export async function authenticateAdmin(authKey) {
    const authKeyTrimmed = String(authKey || "").trim();
    if (!authKeyTrimmed) return null;

    const { rows } = await sql`
      select id, role
      from commands
      where auth_key = ${authKeyTrimmed}
      limit 1
    `;

    if (rows.length === 0) return null;
    const admin = rows[0];
    if (normalizeRole(admin.role) !== ROLE_ADMIN) return null;

    return admin;
}

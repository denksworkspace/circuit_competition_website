import { sql } from "@vercel/postgres";
import { ROLE_ADMIN } from "../_roles.js";

export const DEFAULT_MULTI_UPLOAD_QUOTA_BYTES = 50 * 1024 * 1024 * 1024;
export const DEFAULT_SINGLE_UPLOAD_BYTES = 500 * 1024 * 1024;
export const DEFAULT_ADMIN_SINGLE_UPLOAD_BYTES = 50 * 1024 * 1024 * 1024;

let uploadSettingsReadyPromise = null;

export function normalizeByteValue(raw, fallback) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return fallback;
    return Math.floor(value);
}

export function normalizeCommandUploadSettings(commandRow) {
    const role = String(commandRow?.role || "").trim().toLowerCase();
    const defaultSingle = role === ROLE_ADMIN ? DEFAULT_ADMIN_SINGLE_UPLOAD_BYTES : DEFAULT_SINGLE_UPLOAD_BYTES;

    const maxSingleUploadBytes = normalizeByteValue(commandRow?.max_single_upload_bytes, defaultSingle);
    const totalUploadQuotaBytes = normalizeByteValue(commandRow?.total_upload_quota_bytes, DEFAULT_MULTI_UPLOAD_QUOTA_BYTES);
    const uploadedBytesTotal = Math.max(0, Math.floor(Number(commandRow?.uploaded_bytes_total) || 0));
    const remainingUploadBytes = Math.max(0, totalUploadQuotaBytes - uploadedBytesTotal);

    return {
        maxSingleUploadBytes,
        totalUploadQuotaBytes,
        uploadedBytesTotal,
        remainingUploadBytes,
    };
}

export async function ensureCommandUploadSettingsSchema() {
    if (!uploadSettingsReadyPromise) {
        uploadSettingsReadyPromise = (async () => {
            await sql`alter table commands add column if not exists max_single_upload_bytes bigint`;
            await sql`alter table commands add column if not exists total_upload_quota_bytes bigint`;
            await sql`alter table commands add column if not exists uploaded_bytes_total bigint`;

            await sql`
              update commands
              set max_single_upload_bytes = case
                when lower(role) = 'admin' then 53687091200
                else 524288000
              end
              where max_single_upload_bytes is null
                 or max_single_upload_bytes <= 0
            `;

            await sql`
              update commands
              set total_upload_quota_bytes = 53687091200
              where total_upload_quota_bytes is null
                 or total_upload_quota_bytes <= 0
            `;

            await sql`
              update commands
              set uploaded_bytes_total = 0
              where uploaded_bytes_total is null
                 or uploaded_bytes_total < 0
            `;

            await sql`alter table commands alter column max_single_upload_bytes set default 524288000`;
            await sql`alter table commands alter column total_upload_quota_bytes set default 53687091200`;
            await sql`alter table commands alter column uploaded_bytes_total set default 0`;
        })().catch((error) => {
            uploadSettingsReadyPromise = null;
            throw error;
        });
    }

    return uploadSettingsReadyPromise;
}

import { ROLE_ADMIN } from "../_roles.js";

export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
export const MAX_ADMIN_UPLOAD_BYTES = 50 * 1024 * 1024 * 1024;
export const MAX_MULTI_FILE_BATCH_COUNT = 100;

export function maxUploadBytesByRole(role) {
    return role === ROLE_ADMIN ? MAX_ADMIN_UPLOAD_BYTES : MAX_UPLOAD_BYTES;
}

export function uploadSizeErrorByRole(role) {
    if (role === ROLE_ADMIN) {
        return "File is too large. Maximum size is 50 GB for admin.";
    }
    return "File is too large. Maximum size is 500 MB.";
}

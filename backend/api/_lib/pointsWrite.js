// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";
import { normalizePointRow } from "./points.js";
import {
    DEFAULT_MAX_MULTI_FILE_BATCH_COUNT,
    normalizeCommandUploadSettings,
} from "./commandUploadSettings.js";
import { addActionLog } from "./actionLogs.js";
import { ensurePointsStatusConstraint } from "./pointsStatus.js";

export const MAX_DESCRIPTION_LEN = 200;

function isValidStatus(status) {
    return ["non-verified", "verified", "failed"].includes(status);
}

async function markHasNewParetoForAllIfNeeded({ pointId, benchmark, delay, area }) {
    const normalizedBenchmark = String(benchmark || "").trim();
    if (!normalizedBenchmark || normalizedBenchmark === "test") return false;

    const dominatedRes = await sql`
      select 1
      from public.points
      where benchmark = ${normalizedBenchmark}
        and id <> ${String(pointId || "")}
        and lower(coalesce(lifecycle_status, 'main')) <> 'deleted'
        and delay <= ${Number(delay)}
        and area <= ${Number(area)}
      limit 1
    `;
    const dominatedRows = Array.isArray(dominatedRes?.rows) ? dominatedRes.rows : [];
    if (dominatedRows.length > 0) return false;

    await sql`
      update public.commands
      set has_new_pareto = true
      where coalesce(has_new_pareto, false) = false
    `;
    return true;
}

export async function createPointForCommand({
    command,
    id,
    benchmark,
    delay,
    area,
    description,
    fileName,
    status,
    checkerVersion = null,
    manualSynthesis = false,
    fileSize,
    batchSize,
}) {
    await ensurePointsStatusConstraint();

    if (!id || !benchmark || typeof delay !== "number" || typeof area !== "number" || !fileName) {
        return { ok: false, statusCode: 400, error: "Invalid payload." };
    }

    const descriptionTrimmed = String(description || "").trim() || "circuit";
    if (descriptionTrimmed.length > MAX_DESCRIPTION_LEN) {
        return {
            ok: false,
            statusCode: 400,
            error: `Description is too long. Maximum length is ${MAX_DESCRIPTION_LEN}.`,
        };
    }

    if (typeof fileSize !== "number" || !Number.isFinite(fileSize) || fileSize < 0) {
        return { ok: false, statusCode: 400, error: "Invalid file size." };
    }

    const normalizedBatchSize = Number(batchSize ?? 1);
    if (!Number.isInteger(normalizedBatchSize) || normalizedBatchSize < 1) {
        return { ok: false, statusCode: 400, error: "Invalid batch size." };
    }

    const uploadSettings = normalizeCommandUploadSettings(command);
    const maxBatchCount = Math.max(1, Number(uploadSettings.maxMultiFileBatchCount || DEFAULT_MAX_MULTI_FILE_BATCH_COUNT));
    if (normalizedBatchSize > maxBatchCount) {
        return { ok: false, statusCode: 400, error: `Too many files in batch. Maximum is ${maxBatchCount}.` };
    }

    const isMultiFileBatch = normalizedBatchSize > 1;
    const chargeBytes = isMultiFileBatch ? fileSize : 0;
    const maxBytes = uploadSettings.maxSingleUploadBytes;

    if (fileSize > maxBytes) {
        return {
            ok: false,
            statusCode: 413,
            error: `File is too large. Maximum size is ${(maxBytes / (1024 ** 3)).toFixed(2)} GB.`,
        };
    }

    if (chargeBytes > uploadSettings.remainingUploadBytes) {
        return {
            ok: false,
            statusCode: 413,
            error: `Multi-file quota exceeded. Remaining: ${(uploadSettings.remainingUploadBytes / (1024 ** 3)).toFixed(2)} GB.`,
        };
    }

    const normalizedStatus = status || "non-verified";
    if (!isValidStatus(normalizedStatus)) {
        return { ok: false, statusCode: 400, error: "Invalid status." };
    }

    let quotaRow = null;

    try {
        if (chargeBytes > 0) {
            const quotaUpdate = await sql`
              update public.commands
              set uploaded_bytes_total = uploaded_bytes_total + ${chargeBytes}::bigint
              where id = ${command.id}
                and uploaded_bytes_total + ${chargeBytes}::bigint <= total_upload_quota_bytes
              returning uploaded_bytes_total, total_upload_quota_bytes, max_single_upload_bytes, role
            `;
            if (quotaUpdate.rows.length === 0) {
                return {
                    ok: false,
                    statusCode: 413,
                    error: `Multi-file quota exceeded. Remaining: ${(uploadSettings.remainingUploadBytes / (1024 ** 3)).toFixed(2)} GB.`,
                };
            }
            quotaRow = quotaUpdate.rows[0];
        }

        const insert = await sql`
            insert into public.points (
                id, benchmark, delay, area, description, sender, file_name, status,
                lifecycle_status, checker_version, manual_synthesis, command_id
            )
            values (
                ${id}, ${String(benchmark)}, ${delay}, ${area}, ${descriptionTrimmed}, ${command.name}, ${fileName}, ${normalizedStatus},
                'main', ${checkerVersion ?? null}, ${Boolean(manualSynthesis)}, ${command.id}
            )
            returning id, benchmark, delay, area, description, sender, file_name, status, checker_version, manual_synthesis
        `;
        const nextQuota = quotaRow
            ? normalizeCommandUploadSettings(quotaRow)
            : normalizeCommandUploadSettings(command);

        await markHasNewParetoForAllIfNeeded({
            pointId: id,
            benchmark,
            delay,
            area,
        });

        await addActionLog({
            commandId: command.id,
            actorCommandId: command.id,
            action: "point_created",
            details: {
                pointId: id,
                bench: String(benchmark),
                benchmark: String(benchmark),
                delay,
                area,
                fileName,
                fileSize,
                manualSynthesis: Boolean(manualSynthesis),
                isMultiFileBatch,
                chargedBytes: chargeBytes,
            },
        });

        return {
            ok: true,
            point: normalizePointRow(insert.rows[0]),
            quota: nextQuota,
        };
    } catch (error) {
        if (chargeBytes > 0) {
            await sql`
              update public.commands
              set uploaded_bytes_total = greatest(0::bigint, uploaded_bytes_total - ${chargeBytes}::bigint)
              where id = ${command.id}
            `;
        }
        const message = String(error?.message || "").toLowerCase();
        if (message.includes("unique") || message.includes("duplicate")) {
            return { ok: false, statusCode: 409, error: "Point with this file name already exists." };
        }
        return { ok: false, statusCode: 500, error: "Failed to save point." };
    }
}

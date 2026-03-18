// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";
import { ensureCommandRolesSchema } from "./_roles.js";
import { parseBody, rejectMethod } from "./_lib/http.js";
import { ensureCommandUploadSettingsSchema, normalizeCommandUploadSettings } from "./_lib/commandUploadSettings.js";
import {
    REQUEST_STATUS_QUEUED,
    ensureUploadQueueSchema,
    normalizeUploadRequestRow,
} from "./_lib/uploadQueue.js";
import { findLatestBlockingUploadRequest, getCommandByAuthKey } from "./_lib/uploadQueueOps.js";
import { buildQueueObjectKey, buildQueueUploadUrl, getQueueBucketName } from "./_lib/queueS3.js";
import { uid } from "./_lib/uploadQueueToken.js";
import { MAX_DESCRIPTION_LEN } from "./_lib/pointsWrite.js";
import { normalizeCheckerVersion } from "./_lib/pointVerification.js";
import { checkMaintenanceBlock } from "./_lib/maintenanceMode.js";

function normalizeParserSelection(raw) {
    return String(raw || "").trim().toUpperCase() === "ABC" ? "ABC" : null;
}

function parseTimeoutSeconds(raw, fallback, cap) {
    if (raw === undefined || raw === null || raw === "") return Math.max(1, Number(fallback || 60));
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 1) return null;
    return Math.min(Math.max(1, Math.floor(parsed)), Math.max(1, Number(cap || 60)));
}

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["POST"])) return;

    const body = parseBody(req);
    const authKey = String(body?.authKey || "").trim();
    const files = Array.isArray(body?.files) ? body.files : [];
    const description = String(body?.description || "").trim() || "schema";
    const selectedParser = normalizeParserSelection(body?.selectedParser);
    const selectedChecker = normalizeCheckerVersion(body?.selectedChecker);
    if (!authKey) {
        res.status(401).json({ error: "Missing auth key." });
        return;
    }
    if (description.length > MAX_DESCRIPTION_LEN) {
        res.status(400).json({ error: `Description is too long (max ${MAX_DESCRIPTION_LEN}).` });
        return;
    }
    if (files.length < 1) {
        res.status(400).json({ error: "At least one file is required." });
        return;
    }
    if (!selectedParser) {
        res.status(400).json({ error: "Parser must be ABC." });
        return;
    }
    if (!getQueueBucketName()) {
        res.status(500).json({ error: "Queue S3 bucket is not configured." });
        return;
    }

    await ensureCommandRolesSchema();
    await ensureCommandUploadSettingsSchema();
    await ensureUploadQueueSchema();

    const command = await getCommandByAuthKey(authKey);
    if (!command) {
        res.status(401).json({ error: "Invalid auth key." });
        return;
    }
    const maintenance = await checkMaintenanceBlock({
        ...req,
        body,
        urlPath: "/api/points-upload-request-create",
    });
    if (maintenance.blocked) {
        res.status(503).json({ error: maintenance.state?.message || "Technical maintenance is in progress." });
        return;
    }

    const blockingRequest = await findLatestBlockingUploadRequest(command.id);
    if (blockingRequest) {
        const blockingStatus = String(blockingRequest.status || "").toLowerCase();
        const error = blockingStatus === "waiting_manual_verdict"
            ? "Previous upload is waiting for manual verdict."
            : "An active upload request is already running.";
        res.status(409).json({ error });
        return;
    }

    const uploadSettings = normalizeCommandUploadSettings(command);
    const maxBatchCount = Math.max(1, Number(uploadSettings.maxMultiFileBatchCount || 100));
    if (files.length > maxBatchCount) {
        res.status(400).json({ error: `Too many files selected. Maximum is ${maxBatchCount}.` });
        return;
    }

    const normalizedFiles = [];
    let totalBytes = 0;
    for (let index = 0; index < files.length; index += 1) {
        const item = files[index] || {};
        const originalFileName = String(item.originalFileName || item.fileName || "").trim();
        const fileSize = Number(item.fileSize);
        if (!originalFileName) {
            res.status(400).json({ error: "File name is required for every file." });
            return;
        }
        if (!Number.isFinite(fileSize) || fileSize < 0) {
            res.status(400).json({ error: `Invalid file size for ${originalFileName}.` });
            return;
        }
        if (fileSize > uploadSettings.maxSingleUploadBytes) {
            res.status(413).json({
                error: `File is too large. Maximum size is ${(uploadSettings.maxSingleUploadBytes / (1024 ** 3)).toFixed(2)} GB.`,
            });
            return;
        }
        totalBytes += fileSize;
        normalizedFiles.push({
            index,
            originalFileName,
            fileSize,
        });
    }
    if (normalizedFiles.length > 1 && totalBytes > uploadSettings.remainingUploadBytes) {
        res.status(413).json({
            error: `Multi-file quota exceeded. Remaining: ${(uploadSettings.remainingUploadBytes / (1024 ** 3)).toFixed(2)} GB.`,
        });
        return;
    }

    const parserTimeoutSeconds = parseTimeoutSeconds(
        body?.parserTimeoutSeconds,
        command.abc_metrics_timeout_seconds,
        command.abc_metrics_timeout_seconds
    );
    const checkerTimeoutSeconds = parseTimeoutSeconds(
        body?.checkerTimeoutSeconds,
        command.abc_verify_timeout_seconds,
        command.abc_verify_timeout_seconds
    );
    if (parserTimeoutSeconds == null || checkerTimeoutSeconds == null) {
        res.status(400).json({ error: "Invalid timeout settings." });
        return;
    }

    const requestId = uid();
    const uploadRows = [];
    await sql`begin`;
    try {
        await sql`
          insert into upload_requests (
            id, command_id, status, selected_parser, selected_checker,
            parser_timeout_seconds, checker_timeout_seconds, description,
            total_count, done_count, verified_count, current_file_name, current_phase
          )
          values (
            ${requestId}, ${command.id}, ${REQUEST_STATUS_QUEUED}, ${selectedParser}, ${selectedChecker},
            ${parserTimeoutSeconds}, ${checkerTimeoutSeconds}, ${description},
            ${normalizedFiles.length}, 0, 0, '', ''
          )
        `;

        for (const file of normalizedFiles) {
            const fileId = uid();
            const queueFileKey = buildQueueObjectKey({
                requestId,
                fileId,
                originalFileName: file.originalFileName,
            });
            const uploadUrl = buildQueueUploadUrl(queueFileKey);
            if (!uploadUrl) {
                throw new Error("Queue S3 configuration is not complete.");
            }
            await sql`
              insert into upload_request_files (
                id, request_id, order_index, original_file_name, queue_file_key, file_size
              )
              values (
                ${fileId}, ${requestId}, ${file.index}, ${file.originalFileName}, ${queueFileKey}, ${file.fileSize}
              )
            `;
            uploadRows.push({
                fileId,
                originalFileName: file.originalFileName,
                queueFileKey,
                uploadUrl,
                method: "PUT",
            });
        }
        await sql`commit`;
    } catch (error) {
        await sql`rollback`;
        res.status(500).json({ error: String(error?.message || "Failed to create upload request.") });
        return;
    }

    const createdReq = await sql`
      select *
      from upload_requests
      where id = ${requestId}
      limit 1
    `;
    res.status(201).json({
        request: normalizeUploadRequestRow(createdReq.rows[0]),
        files: uploadRows,
    });
}

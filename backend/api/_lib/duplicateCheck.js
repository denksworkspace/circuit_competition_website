// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { sql } from "@vercel/postgres";
import { sha256Hex } from "./circuitHash.js";
import { downloadPointCircuitText } from "./pointVerification.js";
import { ensurePointsStatusConstraint } from "./pointsStatus.js";

export async function findRequestBatchDuplicate({
    requestId,
    fileId,
    benchmark,
    delay,
    area,
    contentHash,
}) {
    if (!requestId || !fileId || !benchmark || !contentHash) return null;
    const duplicateRes = await sql`
      select id, original_file_name, point_id
      from public.upload_request_files
      where request_id = ${requestId}
        and id <> ${fileId}
        and parsed_benchmark = ${String(benchmark)}
        and parsed_delay = ${delay}
        and parsed_area = ${area}
        and content_hash = ${contentHash}
        and lower(coalesce(process_state, '')) = 'processed'
      order by order_index asc
      limit 1
    `;
    if (duplicateRes.rows.length === 0) return null;
    const row = duplicateRes.rows[0];
    return {
        id: String(row.id || ""),
        fileName: String(row.original_file_name || ""),
        pointId: row.point_id ? String(row.point_id) : "",
    };
}

export async function checkDuplicatePointByCircuit({
    benchmark,
    delay,
    area,
    circuitText,
}) {
    await ensurePointsStatusConstraint();
    const candidateHash = sha256Hex(circuitText);
    const sameMetricsRes = await sql`
      select id, file_name, sender, content_hash
      from public.points
      where benchmark = ${benchmark}
        and delay = ${delay}
        and area = ${area}
        and lower(coalesce(lifecycle_status, 'main')) <> 'deleted'
      order by created_at desc
    `;

    for (const row of sameMetricsRes.rows) {
        const storedHash = String(row?.content_hash || "").trim();
        if (storedHash) {
            if (storedHash === candidateHash) {
                return {
                    duplicate: true,
                    point: {
                        id: String(row.id || ""),
                        fileName: String(row.file_name || ""),
                        sender: String(row.sender || ""),
                    },
                    blockedByCheckError: false,
                    errorReason: "",
                };
            }
            continue;
        }
        const fileName = String(row?.file_name || "").trim();
        if (!fileName) continue;
        const downloaded = await downloadPointCircuitText(fileName);
        if (!downloaded.ok) {
            return {
                duplicate: false,
                point: null,
                blockedByCheckError: true,
                errorReason: downloaded.reason || "Failed to verify duplicates against existing points.",
            };
        }
        const existingHash = sha256Hex(downloaded.circuitText);
        await sql`
          update public.points
          set content_hash = ${existingHash}
          where id = ${String(row.id || "")}
            and (content_hash is null or btrim(content_hash) = '')
        `;
        if (existingHash === candidateHash) {
            return {
                duplicate: true,
                point: {
                    id: String(row.id || ""),
                    fileName,
                    sender: String(row.sender || ""),
                },
                blockedByCheckError: false,
                errorReason: "",
            };
        }
    }

    return {
        duplicate: false,
        point: null,
        blockedByCheckError: false,
        errorReason: "",
    };
}

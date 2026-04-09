// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import crypto from "node:crypto";
import { sql } from "@vercel/postgres";
import { downloadPointCircuitText } from "./pointVerification.js";

function normalizeCircuitTextForHash(textRaw) {
    return String(textRaw || "")
        .replace(/^\uFEFF/, "")
        .replace(/\r\n?/g, "\n")
        .trimEnd();
}

function sha256Hex(textRaw) {
    return crypto
        .createHash("sha256")
        .update(normalizeCircuitTextForHash(textRaw), "utf8")
        .digest("hex");
}

export async function checkDuplicatePointByCircuit({
    benchmark,
    delay,
    area,
    circuitText,
}) {
    const candidateHash = sha256Hex(circuitText);
    const sameMetricsRes = await sql`
      select id, file_name, sender
      from public.points
      where benchmark = ${benchmark}
        and delay = ${delay}
        and area = ${area}
      order by created_at desc
    `;

    for (const row of sameMetricsRes.rows) {
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
        if (sha256Hex(downloaded.circuitText) === candidateHash) {
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

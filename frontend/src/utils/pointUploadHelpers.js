import { normalizeCircuitTextForHash } from "./uploadFlowUtils.js";

export async function readCircuitFileAsText(file) {
    if (file && typeof file.text === "function") {
        return await file.text();
    }
    return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Failed to read file content."));
        reader.readAsText(file);
    });
}

export async function sha256Hex(textRaw) {
    const text = normalizeCircuitTextForHash(textRaw);
    const subtle = globalThis?.crypto?.subtle;
    if (!subtle) return null;
    const bytes = new TextEncoder().encode(text);
    const digest = await subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

export async function findIdenticalPointDuplicate({
    benchmark,
    delay,
    area,
    circuitText,
    signal = undefined,
    checkDuplicate,
}) {
    const benchmarkStr = String(benchmark || "").trim();
    const delayNum = Number(delay);
    const areaNum = Number(area);
    if (!benchmarkStr || benchmarkStr === "test" || !Number.isFinite(delayNum) || !Number.isFinite(areaNum)) {
        return {
            duplicateInfo: null,
            blockedByCheckError: false,
            errorReason: "",
        };
    }
    try {
        const duplicateCheck = await checkDuplicate({
            benchmark: benchmarkStr,
            delay: delayNum,
            area: areaNum,
            circuitText: String(circuitText || ""),
            signal,
        });
        if (duplicateCheck?.duplicate && duplicateCheck?.point) {
            return {
                duplicateInfo: {
                    id: String(duplicateCheck.point.id || ""),
                    fileName: String(duplicateCheck.point.fileName || ""),
                    sender: String(duplicateCheck.point.sender || ""),
                },
                blockedByCheckError: false,
                errorReason: "",
            };
        }
        return {
            duplicateInfo: null,
            blockedByCheckError: false,
            errorReason: "",
        };
    } catch (error) {
        if (error?.name === "AbortError") throw error;
        return {
            duplicateInfo: null,
            blockedByCheckError: true,
            errorReason: String(error?.message || "Failed to verify duplicates against existing points."),
        };
    }
}

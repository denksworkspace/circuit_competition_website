export function getBenchFilesError({
    files,
    maxMultiFileBatchCount,
    maxSingleUploadBytes,
    remainingUploadBytes,
    formatGb,
}) {
    if (!Array.isArray(files) || files.length === 0) return "";
    if (files.length > maxMultiFileBatchCount) {
        return `Too many files selected. Maximum is ${maxMultiFileBatchCount}.`;
    }

    for (const file of files) {
        if (file.size > maxSingleUploadBytes) {
            return `File is too large. Maximum size is ${formatGb(maxSingleUploadBytes)} GB.`;
        }
    }

    if (files.length > 1) {
        const batchBytes = files.reduce((sum, file) => sum + file.size, 0);
        if (batchBytes > remainingUploadBytes) {
            return `Multi-file quota exceeded. Remaining: ${formatGb(remainingUploadBytes)} GB.`;
        }
    }

    return "";
}

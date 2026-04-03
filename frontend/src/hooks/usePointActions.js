import { useState } from "react";
import { deletePoint, downloadPointCircuitFile } from "../services/apiClient.js";
import { downloadBlobAsFile } from "../utils/fileDownloadUtils.js";

export function usePointActions({
    points,
    setPoints,
    lastAddedId,
    setLastAddedId,
    currentCommand,
    authKeyDraft,
}) {
    const [actionPoint, setActionPoint] = useState(null);

    function getPointDownloadUrl(point) {
        if (!point || !point.fileName || point.benchmark === "test" || !point.id) return null;
        return `download:${String(point.id)}`;
    }

    function canDeletePoint(point) {
        if (!point) return false;
        if (point.benchmark === "test") return true;
        return Boolean(currentCommand && point.sender === currentCommand.name);
    }

    function canTestPoint(point) {
        if (!point || point.benchmark === "test") return false;
        return Boolean(currentCommand);
    }

    async function downloadCircuit(point) {
        if (!getPointDownloadUrl(point)) {
            window.alert("File does not exist.");
            return;
        }
        try {
            const result = await downloadPointCircuitFile({
                authKey: authKeyDraft,
                pointId: point.id,
                fallbackName: point.fileName || "circuit.bench",
            });
            downloadBlobAsFile(result.blob, result.fileName || point.fileName || "circuit.bench");
        } catch (error) {
            window.alert(error?.message || "Failed to download circuit.");
        }
    }

    async function deletePointById(id) {
        const point = points.find((x) => x.id === id);
        if (!point) return false;

        if (point?.benchmark === "test") {
            setPoints((prev) => prev.filter((x) => x.id !== id));
            if (lastAddedId === id) setLastAddedId(null);
            return true;
        }

        try {
            await deletePoint({ id, authKey: authKeyDraft });
        } catch (error) {
            window.alert(error?.message || "Failed to delete point.");
            return false;
        }

        setPoints((prev) => prev.filter((x) => x.id !== id));
        if (lastAddedId === id) setLastAddedId(null);
        return true;
    }

    async function deletePointsByIds(ids) {
        const unique = Array.from(new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || "").trim()).filter(Boolean)));
        const failed = [];
        const deleted = [];
        for (const id of unique) {
            const ok = await deletePointById(id);
            if (ok) deleted.push(id);
            else failed.push(id);
        }
        return { deleted, failed };
    }

    function openPointActionModal(pointId) {
        const point = points.find((x) => x.id === pointId);
        if (!point) return;
        setActionPoint(point);
    }

    function closePointActionModal() {
        setActionPoint(null);
    }

    async function confirmAndDeletePoint(pointId) {
        const point = points.find((x) => x.id === pointId);
        if (!point || !canDeletePoint(point)) return false;
        if (!window.confirm(`Delete ${point.fileName}?`)) return false;
        return await deletePointById(pointId);
    }

    return {
        actionPoint,
        getPointDownloadUrl,
        canDeletePoint,
        canTestPoint,
        downloadCircuit,
        openPointActionModal,
        closePointActionModal,
        deletePointById,
        deletePointsByIds,
        confirmAndDeletePoint,
    };
}

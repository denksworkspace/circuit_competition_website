import { useState } from "react";
import { deletePoint } from "../services/apiClient.js";

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
        if (!point || !point.fileName || point.benchmark === "test") return null;
        if (point.downloadUrl) return point.downloadUrl;
        return null;
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
        const url = getPointDownloadUrl(point);
        if (!url) {
            window.alert("File does not exist.");
            return;
        }

        const a = document.createElement("a");
        a.href = url;
        a.download = point.fileName || "circuit.bench";
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        document.body.appendChild(a);
        a.click();
        a.remove();
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
        confirmAndDeletePoint,
    };
}

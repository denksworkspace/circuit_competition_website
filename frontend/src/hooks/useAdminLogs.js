// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAdminActionLogs, fetchAdminUserById } from "../services/apiClient.js";

export function useAdminLogs({ isAdmin, authKeyDraft, commands }) {
    const [adminLogs, setAdminLogs] = useState(() => []);
    const [adminLogCommandQuery, setAdminLogCommandQuery] = useState("");
    const [adminLogActionQuery, setAdminLogActionQuery] = useState("");
    const [selectedAdminLogActions, setSelectedAdminLogActions] = useState(() => []);

    function addSelectedAdminLogAction(action) {
        setSelectedAdminLogActions((prev) => (prev.includes(action) ? prev : [...prev, action]));
    }

    function removeSelectedAdminLogAction(action) {
        setSelectedAdminLogActions((prev) => prev.filter((x) => x !== action));
    }

    const refreshAdminLogs = useCallback(async () => {
        if (!isAdmin) return;
        const commandNameById = new Map(commands.map((cmd) => [Number(cmd.id), String(cmd.name || "")]));
        const normalizeLogRows = (rows) =>
            rows.map((log) => {
                const commandId = Number(log?.commandId);
                const fallbackName = commandNameById.get(commandId) || "";
                return {
                    ...log,
                    commandId,
                    targetName: String(log?.targetName || fallbackName || ""),
                };
            });
        try {
            let globalLogs = [];
            try {
                const payload = await fetchAdminActionLogs({ authKey: authKeyDraft, limit: 1000 });
                globalLogs = normalizeLogRows(Array.isArray(payload?.actionLogs) ? payload.actionLogs : []);
            } catch (error) {
                console.error(error);
            }
            if (globalLogs.length > 0) {
                setAdminLogs(globalLogs);
                return;
            }

            // Fallback for environments where global logs endpoint is unavailable:
            // collect user-scoped logs and merge them.
            if (!Array.isArray(commands) || commands.length === 0) {
                setAdminLogs([]);
                return;
            }
            const perUserPayloads = await Promise.all(
                commands.map((cmd) => fetchAdminUserById({ authKey: authKeyDraft, userId: cmd.id }).catch(() => null))
            );
            const merged = [];
            const seen = new Set();
            for (const item of perUserPayloads) {
                const logs = Array.isArray(item?.actionLogs) ? item.actionLogs : [];
                for (const rawLog of normalizeLogRows(logs)) {
                    const log = rawLog;
                    const id = Number(log?.id);
                    if (Number.isFinite(id) && seen.has(id)) continue;
                    if (Number.isFinite(id)) seen.add(id);
                    merged.push(log);
                }
            }
            merged.sort((a, b) => {
                const ta = Date.parse(String(a?.createdAt || "")) || 0;
                const tb = Date.parse(String(b?.createdAt || "")) || 0;
                return tb - ta;
            });
            setAdminLogs(merged);
        } catch (error) {
            console.error(error);
            setAdminLogs([]);
        }
    }, [authKeyDraft, commands, isAdmin]);

    useEffect(() => {
        if (!isAdmin) return;
        const timer = setTimeout(() => {
            void refreshAdminLogs();
        }, 0);
        return () => clearTimeout(timer);
    }, [isAdmin, refreshAdminLogs]);

    const selectedAdminLogActionSet = useMemo(() => new Set(selectedAdminLogActions), [selectedAdminLogActions]);
    const availableAdminLogActions = useMemo(() => {
        const actions = new Set();
        for (const log of adminLogs) {
            if (log?.action) actions.add(String(log.action));
        }
        return Array.from(actions).sort((a, b) => a.localeCompare(b));
    }, [adminLogs]);
    const filteredAdminLogs = useMemo(() => {
        const query = adminLogCommandQuery.trim().toLowerCase();
        if (!query && selectedAdminLogActionSet.size === 0) return adminLogs;
        return adminLogs.filter((log) => {
            const targetName = String(log?.targetName || "").toLowerCase();
            if (query && !targetName.startsWith(query)) return false;
            if (selectedAdminLogActionSet.size > 0 && !selectedAdminLogActionSet.has(String(log?.action || ""))) {
                return false;
            }
            return true;
        });
    }, [adminLogs, adminLogCommandQuery, selectedAdminLogActionSet]);
    const adminLogsPreview = useMemo(() => filteredAdminLogs.slice(0, 3), [filteredAdminLogs]);
    const adminLogsHasMore = filteredAdminLogs.length > adminLogsPreview.length;

    return {
        adminLogs,
        adminLogCommandQuery,
        setAdminLogCommandQuery,
        adminLogActionQuery,
        setAdminLogActionQuery,
        selectedAdminLogActions,
        addSelectedAdminLogAction,
        removeSelectedAdminLogAction,
        selectedAdminLogActionSet,
        availableAdminLogActions,
        filteredAdminLogs,
        adminLogsPreview,
        adminLogsHasMore,
        refreshAdminLogs,
    };
}

// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { useEffect, useState } from "react";
import { ROLE_VIEW } from "../constants/appConstants.js";
import { fetchCommandByAuthKey, fetchCommands, fetchPoints, fetchViewCommands, fetchViewPoints } from "../services/apiClient.js";

const AUTH_KEY_STORAGE = "bench_auth_key";
const VIEW_MODE_STORAGE = "bench_view_mode";

function buildViewCommand() {
    return {
        id: -1,
        name: "View",
        color: "#6b7280",
        role: ROLE_VIEW,
        maxSingleUploadBytes: 0,
        totalUploadQuotaBytes: 0,
        uploadedBytesTotal: 0,
        remainingUploadBytes: 0,
        maxMultiFileBatchCount: 1,
        abcVerifyTimeoutSeconds: 60,
        abcMetricsTimeoutSeconds: 60,
        hasNewPareto: false,
        lastParetoExportAt: null,
    };
}

export function useAppAuth({ setPoints, setCommands }) {
    const [authKeyDraft, setAuthKeyDraft] = useState(() => localStorage.getItem(AUTH_KEY_STORAGE) || "");
    const [currentCommand, setCurrentCommand] = useState(null);
    const [authError, setAuthError] = useState("");
    const [isAuthChecking, setIsAuthChecking] = useState(false);
    const [isBootstrapping, setIsBootstrapping] = useState(true);

    async function loadViewMode() {
        const [rows, dbCommands] = await Promise.all([fetchViewPoints(), fetchViewCommands()]);
        setPoints(rows);
        setCommands(dbCommands);
        setCurrentCommand(buildViewCommand());
        setAuthKeyDraft("");
        setAuthError("");
    }

    async function tryLogin(e) {
        e.preventDefault();
        const k = authKeyDraft.trim();
        if (!k) {
            setAuthError("Key is required.");
            return;
        }
        setIsAuthChecking(true);
        try {
            const cmd = await fetchCommandByAuthKey(k);
            if (!cmd) throw new Error("Invalid key.");
            const [rows, dbCommands] = await Promise.all([fetchPoints(k), fetchCommands(k)]);
            localStorage.setItem(AUTH_KEY_STORAGE, k);
            localStorage.removeItem(VIEW_MODE_STORAGE);
            setPoints(rows);
            setCommands(dbCommands);
            setCurrentCommand(cmd);
            setAuthError("");
        } catch (err) {
            setAuthError(err?.message || "Invalid key.");
            setCurrentCommand(null);
            setPoints([]);
            setCommands([]);
        } finally {
            setIsAuthChecking(false);
        }
    }

    async function enterViewMode() {
        setIsAuthChecking(true);
        try {
            localStorage.removeItem(AUTH_KEY_STORAGE);
            localStorage.setItem(VIEW_MODE_STORAGE, "1");
            await loadViewMode();
        } catch (err) {
            localStorage.removeItem(VIEW_MODE_STORAGE);
            setAuthError(err?.message || "Failed to enter view mode.");
            setCurrentCommand(null);
            setPoints([]);
            setCommands([]);
        } finally {
            setIsAuthChecking(false);
        }
    }

    function logout() {
        localStorage.removeItem(AUTH_KEY_STORAGE);
        localStorage.removeItem(VIEW_MODE_STORAGE);
        setCurrentCommand(null);
        setAuthKeyDraft("");
        setAuthError("");
        setPoints([]);
        setCommands([]);
    }

    useEffect(() => {
        let alive = true;
        const savedKey = (localStorage.getItem(AUTH_KEY_STORAGE) || "").trim();
        const savedViewMode = localStorage.getItem(VIEW_MODE_STORAGE) === "1";
        if (!savedKey && savedViewMode) {
            loadViewMode()
                .catch(() => {
                    if (!alive) return;
                    localStorage.removeItem(VIEW_MODE_STORAGE);
                    setCurrentCommand(null);
                    setPoints([]);
                    setCommands([]);
                    setAuthError("View mode is unavailable.");
                })
                .finally(() => {
                    if (!alive) return;
                    setIsBootstrapping(false);
                });
            return () => {
                alive = false;
            };
        }
        if (!savedKey) {
            setPoints([]);
            setCommands([]);
            setIsBootstrapping(false);
            return () => {
                alive = false;
            };
        }

        fetchCommandByAuthKey(savedKey)
            .then(async (authedCommand) => {
                if (!authedCommand) throw new Error("Saved key is no longer valid.");
                const [rows, dbCommands] = await Promise.all([fetchPoints(savedKey), fetchCommands(savedKey)]);
                if (!alive) return;
                setPoints(rows);
                setCommands(dbCommands);
                setCurrentCommand(authedCommand);
                setAuthError("");
            })
            .catch(() => {
                if (!alive) return;
                localStorage.removeItem(AUTH_KEY_STORAGE);
                setCurrentCommand(null);
                setPoints([]);
                setCommands([]);
                setAuthError("Saved key is no longer valid.");
            })
            .finally(() => {
                if (!alive) return;
                setIsBootstrapping(false);
            });
        return () => {
            alive = false;
        };
    }, [setCommands, setPoints]);

    return {
        authKeyDraft,
        setAuthKeyDraft,
        currentCommand,
        setCurrentCommand,
        authError,
        setAuthError,
        isAuthChecking,
        isBootstrapping,
        tryLogin,
        enterViewMode,
        logout,
    };
}

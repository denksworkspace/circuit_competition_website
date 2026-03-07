// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { useEffect, useState } from "react";
import { fetchCommandByAuthKey, fetchCommands, fetchPoints } from "../services/apiClient.js";

export function useAppAuth({ setPoints, setCommands }) {
    const [authKeyDraft, setAuthKeyDraft] = useState(() => localStorage.getItem("bench_auth_key") || "");
    const [currentCommand, setCurrentCommand] = useState(null);
    const [authError, setAuthError] = useState("");
    const [isAuthChecking, setIsAuthChecking] = useState(false);
    const [isBootstrapping, setIsBootstrapping] = useState(true);

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
            localStorage.setItem("bench_auth_key", k);
            setCurrentCommand(cmd);
            setAuthError("");
        } catch (err) {
            setAuthError(err?.message || "Invalid key.");
            setCurrentCommand(null);
        } finally {
            setIsAuthChecking(false);
        }
    }

    function logout() {
        localStorage.removeItem("bench_auth_key");
        setCurrentCommand(null);
        setAuthKeyDraft("");
        setAuthError("");
    }

    useEffect(() => {
        let alive = true;
        const savedKey = (localStorage.getItem("bench_auth_key") || "").trim();
        const authPromise = savedKey ? fetchCommandByAuthKey(savedKey).catch(() => null) : Promise.resolve(null);
        Promise.all([fetchPoints(), fetchCommands(), authPromise])
            .then(([rows, dbCommands, authedCommand]) => {
                if (!alive) return;
                setPoints(rows);
                setCommands(dbCommands);
                if (authedCommand) {
                    setCurrentCommand(authedCommand);
                    setAuthError("");
                } else if (savedKey) {
                    localStorage.removeItem("bench_auth_key");
                    setAuthError("Saved key is no longer valid.");
                }
            })
            .catch((e) => {
                if (!alive) return;
                console.error(e);
                setAuthError(String(e?.message || "Failed to load initial data."));
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
        logout,
    };
}

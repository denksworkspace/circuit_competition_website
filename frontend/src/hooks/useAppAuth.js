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
            const [rows, dbCommands] = await Promise.all([fetchPoints(k), fetchCommands(k)]);
            localStorage.setItem("bench_auth_key", k);
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

    function logout() {
        localStorage.removeItem("bench_auth_key");
        setCurrentCommand(null);
        setAuthKeyDraft("");
        setAuthError("");
        setPoints([]);
        setCommands([]);
    }

    useEffect(() => {
        let alive = true;
        const savedKey = (localStorage.getItem("bench_auth_key") || "").trim();
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
                localStorage.removeItem("bench_auth_key");
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
        logout,
    };
}

import { useEffect, useRef, useState } from "react";
import { fetchVerifyPointProgress, verifyPointCircuit } from "../services/apiClient.js";
import { uid } from "../utils/pointUtils.js";
import { mapVerifyProgressLabel } from "../utils/uploadFlowUtils.js";

export function usePointTesting({
    authKeyDraft,
    currentCommand,
    isAdmin,
    verifyTimeoutQuotaSeconds,
    normalizeCheckerForActor,
    enabledCheckers,
    defaultCheckerVersion,
    setPoints,
}) {
    const [selectedTestChecker, setSelectedTestChecker] = useState(defaultCheckerVersion);
    const [testingPointId, setTestingPointId] = useState(null);
    const [testingPointLabel, setTestingPointLabel] = useState("");
    const testingPointTickerRef = useRef(null);
    const testingAbortRef = useRef(null);
    const testingProgressPollRef = useRef(null);

    useEffect(() => {
        return () => {
            if (testingAbortRef.current) {
                testingAbortRef.current.abort();
                testingAbortRef.current = null;
            }
            if (testingPointTickerRef.current) {
                clearInterval(testingPointTickerRef.current);
                testingPointTickerRef.current = null;
            }
            if (testingProgressPollRef.current) {
                clearInterval(testingProgressPollRef.current);
                testingProgressPollRef.current = null;
            }
        };
    }, []);

    async function onTestPoint(point, checkerVersionRaw = selectedTestChecker) {
        if (!point || point.benchmark === "test" || !currentCommand) return;
        if (testingPointId && testingPointId === point.id && testingAbortRef.current) {
            testingAbortRef.current.abort();
            testingAbortRef.current = null;
            if (testingPointTickerRef.current) clearInterval(testingPointTickerRef.current);
            testingPointTickerRef.current = null;
            if (testingProgressPollRef.current) clearInterval(testingProgressPollRef.current);
            testingProgressPollRef.current = null;
            setTestingPointLabel("");
            setTestingPointId(null);
            return;
        }
        if (testingAbortRef.current) {
            testingAbortRef.current.abort();
            testingAbortRef.current = null;
        }
        if (testingPointTickerRef.current) clearInterval(testingPointTickerRef.current);
        testingPointTickerRef.current = null;
        if (testingProgressPollRef.current) clearInterval(testingProgressPollRef.current);
        testingProgressPollRef.current = null;
        setTestingPointId(point.id);
        setTestingPointLabel("Testing: queued");
        const controller = new AbortController();
        testingAbortRef.current = controller;
        const progressToken = uid();
        testingProgressPollRef.current = setInterval(async () => {
            if (controller.signal.aborted) return;
            try {
                const progress = await fetchVerifyPointProgress({ token: progressToken, signal: controller.signal });
                setTestingPointLabel(mapVerifyProgressLabel(progress?.status, verifyTimeoutQuotaSeconds));
            } catch {
                // ignore transient poll failures
            }
        }, 500);
        const canApplyStatus = point.sender === currentCommand?.name || isAdmin;
        const normalizedChecker = normalizeCheckerForActor(checkerVersionRaw);
        const checkerVersion = enabledCheckers.has(normalizedChecker) ? normalizedChecker : defaultCheckerVersion;
        try {
            const result = await verifyPointCircuit({
                authKey: authKeyDraft,
                pointId: point.id,
                applyStatus: canApplyStatus,
                checkerVersion,
                signal: controller.signal,
                progressToken,
            });
            const scriptText = String(result?.script || "").trim();
            const commandInfo = isAdmin && scriptText ? `\n\nServer command:\n${scriptText}` : "";
            if (canApplyStatus) {
                setPoints((prev) =>
                    prev.map((row) =>
                        row.id === point.id
                            ? {
                                ...row,
                                status: result.status,
                                checkerVersion: result.checkerVersion,
                            }
                            : row
                    )
                );
                window.alert(
                    result.equivalent
                        ? `Checker: equivalent. Status updated to verified.${commandInfo}`
                        : `Checker: not equivalent. Status updated to failed.${commandInfo}`
                );
            } else {
                window.alert(
                    result.equivalent
                        ? `Checker: equivalent. Status was not changed.${commandInfo}`
                        : `Checker: not equivalent. Status was not changed.${commandInfo}`
                );
            }
        } catch (error) {
            if (error?.name === "AbortError") return;
            window.alert(error?.message || "Failed to run checker.");
        } finally {
            if (testingAbortRef.current === controller) {
                testingAbortRef.current = null;
            }
            if (testingPointTickerRef.current) clearInterval(testingPointTickerRef.current);
            testingPointTickerRef.current = null;
            if (testingProgressPollRef.current) clearInterval(testingProgressPollRef.current);
            testingProgressPollRef.current = null;
            setTestingPointLabel("");
            setTestingPointId(null);
        }
    }

    return {
        selectedTestChecker,
        setSelectedTestChecker,
        testingPointId,
        testingPointLabel,
        onTestPoint,
    };
}

// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { useEffect, useRef, useState } from "react";

export function useBenchmarkMenu() {
    const [benchmarkMenuOpen, setBenchmarkMenuOpen] = useState(false);
    const benchmarkMenuRef = useRef(null);

    useEffect(() => {
        if (!benchmarkMenuOpen) return;
        function onDocMouseDown(e) {
            if (!benchmarkMenuRef.current) return;
            if (!benchmarkMenuRef.current.contains(e.target)) {
                setBenchmarkMenuOpen(false);
            }
        }
        document.addEventListener("mousedown", onDocMouseDown);
        return () => document.removeEventListener("mousedown", onDocMouseDown);
    }, [benchmarkMenuOpen]);

    return {
        benchmarkMenuOpen,
        setBenchmarkMenuOpen,
        benchmarkMenuRef,
    };
}

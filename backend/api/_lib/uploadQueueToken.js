// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
function sanitizeToken(value) {
    return (
        String(value || "")
            .trim()
            .replace(/[^A-Za-z0-9-]+/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "") || "x"
    );
}

export function uid() {
    return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

export function buildStoredFileName({ benchmark, delay, area, pointId, sender }) {
    return `bench${benchmark}_${delay}_${area}_${sanitizeToken(sender)}_${sanitizeToken(pointId)}.bench`;
}

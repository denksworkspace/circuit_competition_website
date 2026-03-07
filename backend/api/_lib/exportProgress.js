// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { createProgressStore } from "./progressStore.js";

const store = createProgressStore();

export function setExportProgress(tokenRaw, patch) {
    store.set(tokenRaw, patch);
}

export function getExportProgress(tokenRaw) {
    return store.get(tokenRaw);
}

export function clearExportProgress(tokenRaw) {
    store.clear(tokenRaw);
}

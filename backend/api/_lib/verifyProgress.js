// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.

import { createProgressStore } from "./progressStore.js";

const store = createProgressStore();

export function setVerifyProgress(tokenRaw, patch) {
    store.set(tokenRaw, patch);
}

export function getVerifyProgress(tokenRaw) {
    return store.get(tokenRaw);
}

export function clearVerifyProgress(tokenRaw) {
    store.clear(tokenRaw);
}

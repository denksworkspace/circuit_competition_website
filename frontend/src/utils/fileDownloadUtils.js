// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
export function downloadBlobAsFile(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

export function downloadTextAsFile(text, fileName, contentType = "text/plain;charset=utf-8;") {
    const blob = new Blob([text], { type: contentType });
    downloadBlobAsFile(blob, fileName);
}

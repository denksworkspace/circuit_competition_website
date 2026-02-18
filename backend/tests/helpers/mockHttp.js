// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
export function createMockReq({ method = "GET", body } = {}) {
    return { method, body };
}

export function createMockRes() {
    const res = {
        statusCode: 200,
        headers: {},
        body: undefined,
        ended: false,
        setHeader(name, value) {
            this.headers[name] = value;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
        end() {
            this.ended = true;
            return this;
        },
    };

    return res;
}

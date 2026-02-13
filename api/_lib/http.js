export function parseBody(req) {
    if (req.body && typeof req.body === "object") return req.body;
    if (!req.body) return {};
    try {
        return JSON.parse(req.body);
    } catch {
        return {};
    }
}

export function rejectMethod(req, res, allowed) {
    if (allowed.includes(req.method)) return false;
    res.setHeader("Allow", allowed.join(", "));
    res.status(405).end();
    return true;
}

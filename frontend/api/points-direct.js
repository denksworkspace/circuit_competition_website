import { parseBody, rejectMethod } from "./_lib/http.js";

export default async function handler(req, res) {
    if (rejectMethod(req, res, ["POST"])) return;
    parseBody(req);
    res.status(410).json({
        error: "Direct points API is deprecated. Use backend /api/points endpoint.",
    });
}

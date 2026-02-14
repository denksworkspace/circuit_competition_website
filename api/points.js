import { rejectMethod } from "./_lib/http.js";
import { handleGetPoints } from "./_lib/pointsHandlers/getPoints.js";
import { handlePostPoint } from "./_lib/pointsHandlers/postPoint.js";
import { handleDeletePoint } from "./_lib/pointsHandlers/deletePoint.js";

export default async function handler(req, res) {
    if (req.method === "GET") {
        await handleGetPoints(req, res);
        return;
    }

    if (req.method === "POST") {
        await handlePostPoint(req, res);
        return;
    }

    if (req.method === "DELETE") {
        await handleDeletePoint(req, res);
        return;
    }

    if (rejectMethod(req, res, ["GET", "POST", "DELETE"])) return;
}

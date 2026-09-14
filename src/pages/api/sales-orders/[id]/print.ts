import { apiManagement, bad } from "@/lib/api";
import { buildOrderHtml } from "@/lib/letterhead";
import { NextApiRequest, NextApiResponse } from "next";

/** GET /api/sales-orders/[id]/print — letterhead sales order (print/PDF). */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const me = await apiManagement(req, res);
    if (!me) return bad(res, "Forbidden", 403);
    const id = req.query.id as string;
    const html = await buildOrderHtml("SO", id);
    if (!html) return bad(res, "Not found", 404);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(html);
  } catch (e) {
    console.error("[so print]", e);
    return bad(res, "Internal server error", 500);
  }
}

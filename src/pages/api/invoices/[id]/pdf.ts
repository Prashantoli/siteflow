import { apiManagement } from "@/lib/api";
import { bad } from "@/lib/api";
import { buildInvoiceHtml } from "@/lib/invoicing";
import { NextApiRequest, NextApiResponse } from "next";

/** GET /api/invoices/[id]/pdf — printable invoice (browser print-to-PDF). */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const me = await apiManagement(req, res);
    if (!me) return bad(res, "Forbidden", 403);
    const id = req.query.id as string;
    const html = await buildInvoiceHtml(id);
    if (!html) return bad(res, "Not found", 404);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename="invoice.html"`);
    return res.status(200).send(html);
  } catch (e) {
    console.error("[invoice pdf]", e);
    return bad(res, "Internal server error", 500);
  }
}

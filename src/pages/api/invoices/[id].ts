import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, bad, handler, parseBody, apiManagement, sameOrigin, parseId } from "@/lib/api";
import { computeTotals } from "@/lib/invoicing";

const updateSchema = z.object({
  status: z.enum(["DRAFT", "SENT", "CANCELLED"]).optional(),
  dueDate: z.string().optional(),
  notes: z.string().max(1000).optional().nullable(),
});

export default handler(async (req, res) => {
  const id = parseId(req);
  if (!id) return bad(res, "Missing id", 400);
  const me = await apiManagement(req, res);
  if (!me) return bad(res, "Forbidden", 403);

  if (req.method === "GET") {
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        site: true,
        items: true,
        payments: true,
        createdBy: { select: { name: true } },
      },
    });
    if (!invoice) return bad(res, "Not found", 404);
    const { subtotal, tax, total } = computeTotals(invoice.items, invoice.taxPercent);
    const paid = invoice.payments.reduce((s, p) => s + p.amount, 0);
    return ok(res, { invoice: { ...invoice, subtotal, tax, total, paid, balance: total - paid } });
  }

  if (req.method === "PATCH") {
    if (!sameOrigin(req)) return bad(res, "Bad origin", 403);
    const data = await parseBody(req, updateSchema);
    const invoice = await prisma.invoice.update({
      where: { id },
      data: {
        status: data.status,
        notes: data.notes,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      },
    });
    return ok(res, { invoice });
  }

  if (req.method === "DELETE") {
    if (!sameOrigin(req)) return bad(res, "Bad origin", 403);
    const inv = await prisma.invoice.findUnique({ where: { id }, include: { payments: true } });
    if (!inv) return bad(res, "Not found", 404);
    if (inv.payments.length > 0) return bad(res, "Cannot delete an invoice with payments; cancel it instead", 400);
    await prisma.invoice.delete({ where: { id } });
    return ok(res, { deleted: true });
  }

  return bad(res, "Method not allowed", 405);
});

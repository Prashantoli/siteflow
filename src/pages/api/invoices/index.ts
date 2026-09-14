import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, bad, handler, parseBody, apiManagement, sameOrigin } from "@/lib/api";
import { computeTotals, nextInvoiceNumber, recalcInvoiceStatus } from "@/lib/invoicing";

const itemSchema = z.object({
  desc: z.string().min(1).max(300),
  qty: z.number().min(0),
  unit: z.string().max(20).default("unit"),
  unitPrice: z.number().min(0),
});

const createSchema = z.object({
  clientName: z.string().min(2).max(120),
  clientEmail: z.string().email().optional().nullable(),
  clientPhone: z.string().max(24).optional().nullable(),
  siteId: z.string().optional().nullable(),
  dueDate: z.string(),
  taxPercent: z.number().min(0).max(100).default(0),
  currency: z.string().length(3).default("NPR"),
  notes: z.string().max(1000).optional().nullable(),
  items: z.array(itemSchema).min(1),
  status: z.enum(["DRAFT", "SENT"]).default("DRAFT"),
});

export default handler(async (req, res) => {
  if (req.method === "GET") {
    const me = await apiManagement(req, res);
    if (!me) return bad(res, "Forbidden", 403);
    const { status } = req.query;
    const invoices = await prisma.invoice.findMany({
      where: typeof status === "string" && status !== "ALL" ? { status: status as never } : {},
      include: {
        site: { select: { name: true, code: true } },
        items: true,
        payments: true,
        createdBy: { select: { name: true } },
      },
      orderBy: { issueDate: "desc" },
    });
    const withTotals = invoices.map((inv) => {
      const { subtotal, tax, total } = computeTotals(inv.items, inv.taxPercent);
      const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
      return { ...inv, subtotal, tax, total, paid, balance: total - paid };
    });
    return ok(res, { invoices: withTotals });
  }

  if (req.method === "POST") {
    const me = await apiManagement(req, res);
    if (!me) return bad(res, "Forbidden", 403);
    if (!sameOrigin(req)) return bad(res, "Bad origin", 403);
    const data = await parseBody(req, createSchema);
    const number = await nextInvoiceNumber();
    const invoice = await prisma.invoice.create({
      data: {
        number,
        clientName: data.clientName,
        clientEmail: data.clientEmail ?? null,
        clientPhone: data.clientPhone ?? null,
        siteId: data.siteId ?? null,
        status: data.status,
        dueDate: new Date(data.dueDate),
        taxPercent: data.taxPercent,
        currency: data.currency.toUpperCase(),
        notes: data.notes ?? null,
        createdById: me.id,
        items: { create: data.items },
      },
      include: { items: true },
    });
    return ok(res, { invoice }, 201);
  }

  return bad(res, "Method not allowed", 405);
});

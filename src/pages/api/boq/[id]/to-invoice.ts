import { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { ok, bad, apiManagement, sameOrigin } from "@/lib/api";
import { orderTotals } from "@/lib/orders";
import { nextInvoiceNumber } from "@/lib/invoicing";

/**
 * POST /api/boq/[id]/to-invoice — convert a BOQ into a draft invoice.
 * Every BOQ item becomes an invoice line (qty × rate). The invoice is
 * created in DRAFT so the manager can adjust client details before sending.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const me = await apiManagement(req, res);
    if (!me) return bad(res, "Forbidden", 403);
    if (req.method !== "POST") return bad(res, "Method not allowed", 405);
    if (!sameOrigin(req)) return bad(res, "Bad origin", 403);

    const id = typeof req.query.id === "string" ? req.query.id : "";
    if (!id) return bad(res, "Missing id", 400);

    const boq = await prisma.boq.findUnique({
      where: { id },
      include: { items: true, site: true },
    });
    if (!boq) return bad(res, "BOQ not found", 404);
    if (boq.items.length === 0) return bad(res, "This BOQ has no items to invoice", 422);

    // Idempotency guard: don't double-invoice the same BOQ
    const existing = await prisma.invoice.findFirst({
      where: { notes: { contains: `[BOQ:${boq.ref}]` } },
      select: { id: true, number: true },
    });
    if (existing) {
      return ok(res, { invoice: existing, converted: false, message: `Already converted to ${existing.number}` });
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);
    const number = await nextInvoiceNumber();

    const invoice = await prisma.invoice.create({
      data: {
        number,
        clientName: boq.site?.name ?? `${boq.title} (from ${boq.ref})`,
        siteId: boq.siteId,
        status: "DRAFT",
        issueDate: new Date(),
        dueDate,
        taxPercent: 0, // BOQ totals are pre-VAT estimates — manager sets VAT before sending
        currency: boq.currency,
        notes: `Converted from ${boq.ref} — ${boq.title}. [BOQ:${boq.ref}]`,
        createdById: me.id,
        items: {
          create: boq.items.map((i) => ({
            desc: i.description,
            qty: i.qty,
            unit: i.unit,
            unitPrice: i.rate,
          })),
        },
      },
      include: { items: true, site: { select: { name: true } } },
    });

    const totals = orderTotals(boq.items, 0);
    await prisma.activityLog.create({
      data: {
        userId: me.id,
        action: "BOQ_CONVERTED_TO_INVOICE",
        entity: "Invoice",
        entityId: invoice.id,
        detail: `${boq.ref} → ${number} (${totals.total})`,
      },
    });

    return ok(res, { invoice, converted: true }, 201);
  } catch (e) {
    console.error("[boq to-invoice]", e);
    return bad(res, "Internal server error", 500);
  }
}

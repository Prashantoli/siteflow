import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, bad, handler, parseBody, apiManagement, sameOrigin } from "@/lib/api";
import { recalcInvoiceStatus, computeTotals } from "@/lib/invoicing";
import { notifyMany } from "@/lib/notify";
import { PaymentMethod } from "@prisma/client";

const createSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.number().positive(),
  method: z.enum(["CASH", "BANK_TRANSFER", "CARD", "UPI", "CHEQUE", "OTHER"]).default("BANK_TRANSFER"),
  reference: z.string().max(80).optional().nullable(),
});

/**
 * Records a payment and recalculates invoice status.
 * NOTE: "Integrated online payment gateway" — plug Stripe/Razorpay here by
 * creating a checkout session and calling this endpoint from the gateway
 * webhook. The data model and status flow are already gateway-ready.
 */
export default handler(async (req, res) => {
  const me = await apiManagement(req, res);
  if (!me) return bad(res, "Forbidden", 403);
  if (req.method !== "POST") return bad(res, "Method not allowed", 405);
  if (!sameOrigin(req)) return bad(res, "Bad origin", 403);

  const data = await parseBody(req, createSchema);
  const invoice = await prisma.invoice.findUnique({
    where: { id: data.invoiceId },
    include: { items: true, payments: true },
  });
  if (!invoice) return bad(res, "Invoice not found", 404);
  if (invoice.status === "CANCELLED" || invoice.status === "DRAFT") {
    return bad(res, "Send the invoice before recording payments", 400);
  }

  const { total } = computeTotals(invoice.items, invoice.taxPercent);
  const paid = invoice.payments.reduce((s, p) => s + p.amount, 0);
  if (paid + data.amount > total + 0.001) {
    return bad(res, `Payment exceeds balance due (${(total - paid).toFixed(2)})`, 422);
  }

  const payment = await prisma.payment.create({
    data: {
      invoiceId: invoice.id,
      amount: data.amount,
      method: data.method as PaymentMethod,
      reference: data.reference ?? null,
      receivedBy: me.name,
    },
  });

  await recalcInvoiceStatus(invoice.id);

  // notify admins about the payment
  const admins = await prisma.user.findMany({ where: { role: "ADMIN", status: "ACTIVE" }, select: { id: true } });
  await notifyMany(admins.map((a) => a.id), {
    title: "Payment received",
    body: `${payment.amount.toLocaleString("en-US", { style: "currency", currency: "USD" })} recorded on ${invoice.number} by ${me.name}`,
    type: "SYSTEM",
    link: "/portal/invoices",
  });

  return ok(res, { payment }, 201);
});

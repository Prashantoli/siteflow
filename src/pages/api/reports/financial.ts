import { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { ok, bad } from "@/lib/api";
import { apiManagement } from "@/lib/api";
import { computeTotals } from "@/lib/invoicing";

/** GET /api/reports/financial?from=YYYY-MM-DD&to=YYYY-MM-DD — billing + labor cost totals. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const me = await apiManagement(req, res);
    if (!me) return bad(res, "Forbidden", 403);

    const from = typeof req.query.from === "string" && req.query.from ? new Date(`${req.query.from}T00:00:00`) : null;
    const to = typeof req.query.to === "string" && req.query.to ? new Date(`${req.query.to}T23:59:59.999`) : null;
    const range = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };

    const invoices = await prisma.invoice.findMany({
      where: { status: { not: "CANCELLED" }, issueDate: from || to ? range : undefined },
      include: { items: true, payments: from || to ? { where: { paidAt: range } } : true },
    });
    let billed = 0, received = 0;
    for (const inv of invoices) {
      const { total } = computeTotals(inv.items, inv.taxPercent);
      billed += total;
      received += inv.payments.reduce((s, p) => s + p.amount, 0);
    }

    // labor cost = logged attendance hours × each worker's hourly rate
    const att = await prisma.attendance.findMany({
      where: { checkOutAt: { not: null }, checkInAt: from || to ? range : undefined },
      select: { workedMinutes: true, user: { select: { hourlyRate: true } } },
    });
    const payroll = att.reduce((s, a) => s + (a.workedMinutes / 60) * a.user.hourlyRate, 0);

    return ok(res, { billed, received, outstanding: billed - received, payroll });
  } catch (e) {
    console.error("[reports/financial]", e);
    return bad(res, "Internal server error", 500);
  }
}

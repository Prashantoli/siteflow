import { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { ok, bad } from "@/lib/api";
import { apiManagement } from "@/lib/api";
import { computeTotals } from "@/lib/invoicing";

/** GET /api/reports/financial — billing + labor cost totals. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const me = await apiManagement(req, res);
    if (!me) return bad(res, "Forbidden", 403);

    const invoices = await prisma.invoice.findMany({
      where: { status: { not: "CANCELLED" } },
      include: { items: true, payments: true },
    });
    let billed = 0, received = 0;
    for (const inv of invoices) {
      const { total } = computeTotals(inv.items, inv.taxPercent);
      billed += total;
      received += inv.payments.reduce((s, p) => s + p.amount, 0);
    }

    // labor cost = logged attendance hours × each worker's hourly rate
    const att = await prisma.attendance.findMany({
      where: { checkOutAt: { not: null } },
      select: { workedMinutes: true, user: { select: { hourlyRate: true } } },
    });
    const payroll = att.reduce((s, a) => s + (a.workedMinutes / 60) * a.user.hourlyRate, 0);

    return ok(res, { billed, received, outstanding: billed - received, payroll });
  } catch (e) {
    console.error("[reports/financial]", e);
    return bad(res, "Internal server error", 500);
  }
}

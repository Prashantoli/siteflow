import { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { ok, bad } from "@/lib/api";
import { apiManagement } from "@/lib/api";
import { orderTotals } from "@/lib/orders";

/** GET /api/reports/sales — customer totals, monthly trend, recent SOs. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const me = await apiManagement(req, res);
    if (!me) return bad(res, "Forbidden", 403);

    const orders = await prisma.salesOrder.findMany({
      where: { status: { not: "CANCELLED" } },
      include: { items: true, site: { select: { name: true, code: true } } },
      orderBy: { orderDate: "desc" },
    });

    const rows = orders.map((o) => {
      const totals = orderTotals(o.items, o.taxPercent, o.discountAmount);
      return {
        id: o.id, number: o.number, customerName: o.customerName,
        site: o.site?.name ?? null, status: o.status, currency: o.currency,
        orderDate: o.orderDate.toISOString(),
        subtotal: totals.subtotal, vat: totals.tax, total: totals.total,
        delivered: o.status === "DELIVERED",
      };
    });

    const byCustomer = new Map<string, { total: number; orders: number }>();
    for (const r of rows) {
      const cur = byCustomer.get(r.customerName) ?? { total: 0, orders: 0 };
      cur.total += r.total;
      cur.orders += 1;
      byCustomer.set(r.customerName, cur);
    }
    const customers = [...byCustomer.entries()]
      .map(([name, v]) => ({ name, total: v.total, orders: v.orders }))
      .sort((a, b) => b.total - a.total);

    const { nptDateKey } = await import("@/lib/nepal");
    const byMonth = new Map<string, number>();
    for (const r of rows) {
      const key = nptDateKey(r.orderDate).slice(0, 7);
      byMonth.set(key, (byMonth.get(key) ?? 0) + r.total);
    }
    const monthly = [...byMonth.entries()].sort().map(([month, total]) => ({ month, total }));

    const totalRevenue = rows.reduce((s, r) => s + r.total, 0);
    const pendingDeliveries = rows.filter((r) => ["SUBMITTED", "APPROVED", "PARTIALLY_DELIVERED"].includes(r.status)).length;

    return ok(res, { rows, customers, monthly, totalRevenue, pendingDeliveries });
  } catch (e) {
    console.error("[reports/sales]", e);
    return bad(res, "Internal server error", 500);
  }
}

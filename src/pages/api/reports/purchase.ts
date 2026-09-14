import { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { ok, bad } from "@/lib/api";
import { apiManagement } from "@/lib/api";
import { orderTotals } from "@/lib/orders";

/** GET /api/reports/purchase — vendor totals, monthly trend, recent POs. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const me = await apiManagement(req, res);
    if (!me) return bad(res, "Forbidden", 403);

    const orders = await prisma.purchaseOrder.findMany({
      where: { status: { not: "CANCELLED" } },
      include: { items: true, site: { select: { name: true, code: true } } },
      orderBy: { orderDate: "desc" },
    });

    const rows = orders.map((o) => {
      const totals = orderTotals(o.items, o.taxPercent, o.discountAmount);
      return {
        id: o.id, number: o.number, vendorName: o.vendorName,
        site: o.site?.name ?? null, status: o.status, currency: o.currency,
        orderDate: o.orderDate.toISOString(),
        subtotal: totals.subtotal, vat: totals.tax, total: totals.total,
        received: o.status === "RECEIVED",
      };
    });

    // by vendor (NPR-normalized assumption: totals kept in original currency;
    // businesses typically keep one currency per book)
    const byVendor = new Map<string, { total: number; orders: number }>();
    for (const r of rows) {
      const cur = byVendor.get(r.vendorName) ?? { total: 0, orders: 0 };
      cur.total += r.total;
      cur.orders += 1;
      byVendor.set(r.vendorName, cur);
    }
    const vendors = [...byVendor.entries()]
      .map(([name, v]) => ({ name, total: v.total, orders: v.orders }))
      .sort((a, b) => b.total - a.total);

    // by month (NPT calendar)
    const { nptDateKey } = await import("@/lib/nepal");
    const byMonth = new Map<string, number>();
    for (const r of rows) {
      const key = nptDateKey(r.orderDate).slice(0, 7);
      byMonth.set(key, (byMonth.get(key) ?? 0) + r.total);
    }
    const monthly = [...byMonth.entries()].sort().map(([month, total]) => ({ month, total }));

    const totalSpend = rows.reduce((s, r) => s + r.total, 0);
    const pendingApprovals = rows.filter((r) => r.status === "SUBMITTED").length;

    return ok(res, { rows, vendors, monthly, totalSpend, pendingApprovals });
  } catch (e) {
    console.error("[reports/purchase]", e);
    return bad(res, "Internal server error", 500);
  }
}

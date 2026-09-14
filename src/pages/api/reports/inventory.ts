import { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { ok, bad } from "@/lib/api";
import { apiManagement } from "@/lib/api";

/** GET /api/reports/inventory — stock valuation + reorder alerts. */
export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const me = await apiManagement(_req, res);
    if (!me) return bad(res, "Forbidden", 403);

    const items = await prisma.inventoryItem.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
    const stockValue = items.reduce((s, i) => s + i.stockQty * i.avgCost, 0);
    const lowStock = items.filter((i) => i.stockQty <= i.minStock).map((i) => ({ id: i.id, name: i.name, code: i.code, stockQty: i.stockQty, minStock: i.minStock, unit: i.unit }));

    return ok(res, {
      items: items.map((i) => ({ id: i.id, code: i.code, name: i.name, category: i.category, unit: i.unit, stockQty: i.stockQty, minStock: i.minStock, avgCost: i.avgCost, lastPrice: i.lastPrice, value: i.stockQty * i.avgCost })),
      stockValue,
      lowStock,
      itemCount: items.length,
    });
  } catch (e) {
    console.error("[reports/inventory]", e);
    return bad(res, "Internal server error", 500);
  }
}

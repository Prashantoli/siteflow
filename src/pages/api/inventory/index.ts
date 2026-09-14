import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, bad, handler, parseBody, apiManagement, apiUser, sameOrigin } from "@/lib/api";

const createSchema = z.object({
  code: z.string().min(2).max(30).transform((v) => v.toUpperCase().trim()),
  name: z.string().min(2).max(120),
  category: z.string().max(60).optional().nullable(),
  unit: z.string().max(20).default("nos"),
  stockQty: z.number().default(0),
  minStock: z.number().default(0),
  lastPrice: z.number().min(0).default(0),
});

/** GET/POST /api/inventory — item master with live stock and editable prices. */
export default handler(async (req, res) => {
  const me = await apiUser(req, res);
  if (!me) return bad(res, "Unauthorized", 401);

  if (req.method === "GET") {
    const { q, low } = req.query;
    const where: Record<string, unknown> = {};
    if (typeof q === "string" && q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { code: { contains: q, mode: "insensitive" } },
        { category: { contains: q, mode: "insensitive" } },
      ];
    }
    const items = await prisma.inventoryItem.findMany({ where, orderBy: { name: "asc" } });
    const filtered = low === "1" ? items.filter((i) => i.stockQty <= i.minStock) : items;
    return ok(res, { items: filtered });
  }

  if (req.method === "POST") {
    if (me.role === "EMPLOYEE") return bad(res, "Forbidden", 403);
    if (!sameOrigin(req)) return bad(res, "Bad origin", 403);
    const data = await parseBody(req, createSchema);
    const exists = await prisma.inventoryItem.findUnique({ where: { code: data.code } });
    if (exists) return bad(res, "Item code already exists", 409);
    const item = await prisma.inventoryItem.create({
      data: { ...data, avgCost: data.lastPrice },
    });
    return ok(res, { item }, 201);
  }

  return bad(res, "Method not allowed", 405);
});

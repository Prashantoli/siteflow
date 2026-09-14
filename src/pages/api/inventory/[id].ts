import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, bad, handler, parseBody, apiManagement, sameOrigin, parseId } from "@/lib/api";

const updateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  category: z.string().max(60).optional().nullable(),
  unit: z.string().max(20).optional(),
  stockQty: z.number().optional(),
  minStock: z.number().optional(),
  lastPrice: z.number().min(0).optional(), // price fluctuates — editable anytime
  isActive: z.boolean().optional(),
});

/** PATCH/DELETE /api/inventory/[id] — update item (incl. price changes), archive. */
export default handler(async (req, res) => {
  const id = parseId(req);
  if (!id) return bad(res, "Missing id", 400);
  const me = await apiManagement(req, res);
  if (!me) return bad(res, "Forbidden", 403);

  if (req.method === "PATCH") {
    if (!sameOrigin(req)) return bad(res, "Bad origin", 403);
    const data = await parseBody(req, updateSchema);
    const item = await prisma.inventoryItem.update({ where: { id }, data });
    return ok(res, { item });
  }

  if (req.method === "DELETE") {
    if (!sameOrigin(req)) return bad(res, "Bad origin", 403);
    // soft-archive to preserve order history references
    const item = await prisma.inventoryItem.update({ where: { id }, data: { isActive: false } });
    return ok(res, { item: { id: item.id, isActive: item.isActive } });
  }

  return bad(res, "Method not allowed", 405);
});

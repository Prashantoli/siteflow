import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, bad, handler, parseBody, apiManagement, sameOrigin, parseId } from "@/lib/api";
import { orderTotals } from "@/lib/orders";

const itemSchema = z.object({
  inventoryId: z.string().optional().nullable(),
  description: z.string().min(1).max(300),
  unit: z.string().max(20).default("nos"),
  qty: z.number().positive(),
  unitPrice: z.number().min(0),
  remark: z.string().max(300).optional().nullable(),
});

const updateSchema = z.object({
  status: z.enum(["DRAFT", "SUBMITTED", "APPROVED", "PARTIALLY_DELIVERED", "DELIVERED", "CANCELLED"]).optional(),
  deliveryDate: z.string().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  discountAmount: z.number().min(0).optional(),
  items: z.array(itemSchema).optional(),
  /** mark all lines fully delivered → stock-out */
  deliverAll: z.boolean().optional(),
});

/** GET/PATCH/DELETE /api/sales-orders/[id]
 *  PATCH handles delivery: decreases inventory stock. */
export default handler(async (req, res) => {
  const id = parseId(req);
  if (!id) return bad(res, "Missing id", 400);
  const me = await apiManagement(req, res);
  if (!me) return bad(res, "Forbidden", 403);

  if (req.method === "GET") {
    const order = await prisma.salesOrder.findUnique({
      where: { id },
      include: { items: true, site: { select: { name: true, code: true } }, createdBy: { select: { name: true } } },
    });
    if (!order) return bad(res, "Not found", 404);
    return ok(res, { order: { ...order, totals: orderTotals(order.items, order.taxPercent, order.discountAmount) } });
  }

  if (req.method === "PATCH") {
    if (!sameOrigin(req)) return bad(res, "Bad origin", 403);
    const data = await parseBody(req, updateSchema);

    const existing = await prisma.salesOrder.findUnique({ where: { id }, include: { items: true } });
    if (!existing) return bad(res, "Not found", 404);

    // ---- goods delivery: stock-out ----
    if (data.deliverAll) {
      const shortages: string[] = [];
      for (const line of existing.items) {
        if (!line.inventoryId) continue;
        const inv = await prisma.inventoryItem.findUnique({ where: { id: line.inventoryId } });
        if (!inv) continue;
        const remaining = Math.max(0, line.qty - line.deliveredQty);
        if (remaining <= 0) continue;
        if (inv.stockQty < remaining) {
          shortages.push(`${inv.name} (stock ${inv.stockQty} ${inv.unit}, need ${remaining})`);
          continue;
        }
        await prisma.inventoryItem.update({
          where: { id: inv.id },
          data: { stockQty: { decrement: remaining } },
        });
      }
      for (const line of existing.items) {
        if (line.deliveredQty < line.qty) {
          await prisma.salesOrderItem.update({ where: { id: line.id }, data: { deliveredQty: line.qty } });
        }
      }
      await prisma.salesOrder.update({ where: { id }, data: { status: "DELIVERED" } });
      if (shortages.length > 0) {
        // order still marked delivered but flagged
        return ok(res, {
          order: { ...(await prisma.salesOrder.findUnique({ where: { id }, include: { items: true } })), totals: orderTotals(existing.items, existing.taxPercent, existing.discountAmount) },
          warning: `Delivered with stock shortage on: ${shortages.join("; ")}`,
        });
      }
    }

    if (data.items && !data.deliverAll) {
      await prisma.salesOrderItem.deleteMany({ where: { orderId: id } });
      await prisma.salesOrderItem.createMany({
        data: data.items.map((i) => ({ ...i, orderId: id, inventoryId: i.inventoryId ?? null })),
      });
    }

    const order = await prisma.salesOrder.update({
      where: { id },
      data: {
        status: data.deliverAll ? "DELIVERED" : data.status,
        deliveryDate: data.deliveryDate !== undefined ? (data.deliveryDate ? new Date(data.deliveryDate) : null) : undefined,
        notes: data.notes,
        discountAmount: data.discountAmount,
      },
      include: { items: true },
    });
    return ok(res, { order: { ...order, totals: orderTotals(order.items, order.taxPercent, order.discountAmount) } });
  }

  if (req.method === "DELETE") {
    if (!sameOrigin(req)) return bad(res, "Bad origin", 403);
    const order = await prisma.salesOrder.findUnique({ where: { id } });
    if (!order) return bad(res, "Not found", 404);
    if (order.status === "DELIVERED" || order.status === "PARTIALLY_DELIVERED") {
      return bad(res, "Cannot delete a delivered SO — cancel it instead (stock already updated)", 400);
    }
    await prisma.salesOrder.delete({ where: { id } });
    return ok(res, { deleted: true });
  }

  return bad(res, "Method not allowed", 405);
});

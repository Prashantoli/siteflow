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
  status: z.enum(["DRAFT", "SUBMITTED", "APPROVED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"]).optional(),
  expectedDate: z.string().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  discountAmount: z.number().min(0).optional(),
  items: z.array(itemSchema).optional(),
  /** mark all lines fully received → stock-in */
  receiveAll: z.boolean().optional(),
});

/** GET/PATCH/DELETE /api/purchase-orders/[id]
 *  PATCH also handles goods receipt: increases stock, updates moving-average
 *  cost and last purchase price (prices fluctuate). */
export default handler(async (req, res) => {
  const id = parseId(req);
  if (!id) return bad(res, "Missing id", 400);
  const me = await apiManagement(req, res);
  if (!me) return bad(res, "Forbidden", 403);

  if (req.method === "GET") {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: { items: true, site: { select: { name: true, code: true } }, createdBy: { select: { name: true } } },
    });
    if (!order) return bad(res, "Not found", 404);
    return ok(res, { order: { ...order, totals: orderTotals(order.items, order.taxPercent, order.discountAmount) } });
  }

  if (req.method === "PATCH") {
    if (!sameOrigin(req)) return bad(res, "Bad origin", 403);
    const data = await parseBody(req, updateSchema);

    const existing = await prisma.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
    if (!existing) return bad(res, "Not found", 404);

    // ---- goods receipt: stock-in + cost updates ----
    if (data.receiveAll) {
      for (const line of existing.items) {
        if (!line.inventoryId) continue;
        const inv = await prisma.inventoryItem.findUnique({ where: { id: line.inventoryId } });
        if (!inv) continue;
        const remaining = Math.max(0, line.qty - line.receivedQty);
        if (remaining <= 0) continue;
        const newQty = inv.stockQty + remaining;
        // moving average cost
        const avg = newQty > 0 ? (inv.stockQty * inv.avgCost + remaining * line.unitPrice) / newQty : line.unitPrice;
        await prisma.inventoryItem.update({
          where: { id: inv.id },
          data: { stockQty: newQty, avgCost: Math.round(avg * 100) / 100, lastPrice: line.unitPrice },
        });
      }
      for (const line of existing.items) {
        if (line.receivedQty < line.qty) {
          await prisma.purchaseOrderItem.update({ where: { id: line.id }, data: { receivedQty: line.qty } });
        }
      }
      await prisma.purchaseOrder.update({ where: { id }, data: { status: "RECEIVED" } });
    }

    // simple line edits when not receiving
    if (data.items && !data.receiveAll) {
      await prisma.purchaseOrderItem.deleteMany({ where: { orderId: id } });
      await prisma.purchaseOrderItem.createMany({
        data: data.items.map((i) => ({ ...i, orderId: id, inventoryId: i.inventoryId ?? null })),
      });
    }

    const order = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: data.receiveAll ? "RECEIVED" : data.status,
        expectedDate: data.expectedDate !== undefined ? (data.expectedDate ? new Date(data.expectedDate) : null) : undefined,
        notes: data.notes,
        discountAmount: data.discountAmount,
      },
      include: { items: true },
    });
    return ok(res, { order: { ...order, totals: orderTotals(order.items, order.taxPercent, order.discountAmount) } });
  }

  if (req.method === "DELETE") {
    if (!sameOrigin(req)) return bad(res, "Bad origin", 403);
    const order = await prisma.purchaseOrder.findUnique({ where: { id } });
    if (!order) return bad(res, "Not found", 404);
    if (order.status === "RECEIVED" || order.status === "PARTIALLY_RECEIVED") {
      return bad(res, "Cannot delete a received PO — cancel it instead (stock already updated)", 400);
    }
    await prisma.purchaseOrder.delete({ where: { id } });
    return ok(res, { deleted: true });
  }

  return bad(res, "Method not allowed", 405);
});

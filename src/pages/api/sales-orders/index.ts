import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, bad, handler, parseBody, apiManagement, apiUser, sameOrigin } from "@/lib/api";
import { nextSoNumber, orderTotals } from "@/lib/orders";
import { notifyMany } from "@/lib/notify";

const itemSchema = z.object({
  inventoryId: z.string().optional().nullable(),
  description: z.string().min(1).max(300),
  unit: z.string().max(20).default("nos"),
  qty: z.number().positive(),
  unitPrice: z.number().min(0),
  remark: z.string().max(300).optional().nullable(),
});

const createSchema = z.object({
  customerName: z.string().min(2).max(120),
  customerAddress: z.string().max(200).optional().nullable(),
  customerPhone: z.string().max(24).optional().nullable(),
  customerVat: z.string().max(30).optional().nullable(),
  siteId: z.string().optional().nullable(),
  orderDate: z.string().optional(),
  deliveryDate: z.string().optional().nullable(),
  taxPercent: z.number().min(0).max(50).default(13),
  discountAmount: z.number().min(0).default(0),
  currency: z.string().default("NPR"),
  notes: z.string().max(1000).optional().nullable(),
  items: z.array(itemSchema).min(1),
});

/** GET/POST /api/sales-orders — customer sales orders. */
export default handler(async (req, res) => {
  const me = await apiUser(req, res);
  if (!me) return bad(res, "Unauthorized", 401);

  if (req.method === "GET") {
    const { status } = req.query;
    const orders = await prisma.salesOrder.findMany({
      where: typeof status === "string" && status !== "ALL" ? { status } : {},
      include: { items: true, site: { select: { name: true, code: true } }, createdBy: { select: { name: true } } },
      orderBy: { orderDate: "desc" },
    });
    const withTotals = orders.map((o) => ({ ...o, totals: orderTotals(o.items, o.taxPercent, o.discountAmount) }));
    return ok(res, { orders: withTotals });
  }

  if (req.method === "POST") {
    if (me.role === "EMPLOYEE") return bad(res, "Forbidden", 403);
    if (!sameOrigin(req)) return bad(res, "Bad origin", 403);
    const data = await parseBody(req, createSchema);
    const number = await nextSoNumber();
    const order = await prisma.salesOrder.create({
      data: {
        number,
        customerName: data.customerName,
        customerAddress: data.customerAddress ?? null,
        customerPhone: data.customerPhone ?? null,
        customerVat: data.customerVat ?? null,
        siteId: data.siteId ?? null,
        orderDate: data.orderDate ? new Date(data.orderDate) : new Date(),
        deliveryDate: data.deliveryDate ? new Date(data.deliveryDate) : null,
        taxPercent: data.taxPercent,
        discountAmount: data.discountAmount,
        currency: data.currency,
        notes: data.notes ?? null,
        createdById: me.id,
        items: { create: data.items },
      },
      include: { items: true },
    });

    const managers = await prisma.user.findMany({ where: { role: { in: ["ADMIN", "MANAGER"] }, status: "ACTIVE" }, select: { id: true } });
    await notifyMany(managers.map((m) => m.id), {
      title: "Sales Order created",
      body: `${number} for ${data.customerName} — confirmation pending`,
      link: "/portal/sales-orders",
    });
    return ok(res, { order: { ...order, totals: orderTotals(order.items, order.taxPercent, order.discountAmount) } }, 201);
  }

  return bad(res, "Method not allowed", 405);
});

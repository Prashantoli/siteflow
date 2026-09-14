import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, bad, handler, parseBody, apiManagement, apiUser, sameOrigin } from "@/lib/api";
import { nextBoqRef, orderTotals } from "@/lib/orders";

const itemSchema = z.object({
  description: z.string().min(1).max(300),
  unit: z.string().max(20).default("unit"),
  qty: z.number().min(0),
  rate: z.number().min(0),
  remark: z.string().max(300).optional().nullable(),
});

const createSchema = z.object({
  title: z.string().min(2).max(160),
  siteId: z.string().optional().nullable(),
  currency: z.string().default("NPR"),
  notes: z.string().max(1000).optional().nullable(),
  items: z.array(itemSchema).min(1),
});

export default handler(async (req, res) => {
  const me = await apiUser(req, res);
  if (!me) return bad(res, "Unauthorized", 401);
  const manage = me.role !== "EMPLOYEE";

  if (req.method === "GET") {
    const boqs = await prisma.boq.findMany({
      include: { items: true, site: { select: { name: true, code: true } }, createdBy: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    const withTotals = boqs.map((b) => ({
      ...b,
      totals: orderTotals(b.items, 0), // BOQ amounts are pre-VAT estimates
    }));
    return ok(res, { boqs: withTotals });
  }

  if (req.method === "POST") {
    if (!manage) return bad(res, "Forbidden", 403);
    if (!sameOrigin(req)) return bad(res, "Bad origin", 403);
    const data = await parseBody(req, createSchema);
    const ref = await nextBoqRef();
    const boq = await prisma.boq.create({
      data: {
        ref,
        title: data.title,
        siteId: data.siteId ?? null,
        currency: data.currency,
        notes: data.notes ?? null,
        createdById: me.id,
        items: { create: data.items },
      },
      include: { items: true },
    });
    return ok(res, { boq }, 201);
  }

  return bad(res, "Method not allowed", 405);
});

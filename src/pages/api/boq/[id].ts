import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, bad, handler, parseBody, apiManagement, sameOrigin, parseId } from "@/lib/api";
import { orderTotals } from "@/lib/orders";

const itemSchema = z.object({
  description: z.string().min(1).max(300),
  unit: z.string().max(20).default("unit"),
  qty: z.number().min(0),
  rate: z.number().min(0),
  remark: z.string().max(300).optional().nullable(),
});

const updateSchema = z.object({
  title: z.string().min(2).max(160).optional(),
  siteId: z.string().optional().nullable(),
  currency: z.string().optional(),
  notes: z.string().max(1000).optional().nullable(),
  status: z.enum(["DRAFT", "APPROVED", "SUPERSEDED"]).optional(),
  items: z.array(itemSchema).optional(),
});

export default handler(async (req, res) => {
  const id = parseId(req);
  if (!id) return bad(res, "Missing id", 400);
  const me = await apiManagement(req, res);
  if (!me) return bad(res, "Forbidden", 403);

  if (req.method === "GET") {
    const boq = await prisma.boq.findUnique({
      where: { id },
      include: { items: true, site: { select: { name: true, code: true } }, createdBy: { select: { name: true } } },
    });
    if (!boq) return bad(res, "Not found", 404);
    return ok(res, { boq: { ...boq, totals: orderTotals(boq.items, 0) } });
  }

  if (req.method === "PATCH") {
    if (!sameOrigin(req)) return bad(res, "Bad origin", 403);
    const data = await parseBody(req, updateSchema);
    const boq = await prisma.boq.update({
      where: { id },
      data: {
        title: data.title,
        siteId: data.siteId,
        currency: data.currency,
        notes: data.notes,
        status: data.status,
        ...(data.items ? { items: { deleteMany: {}, create: data.items } } : {}),
      },
      include: { items: true },
    });
    return ok(res, { boq: { ...boq, totals: orderTotals(boq.items, 0) } });
  }

  if (req.method === "DELETE") {
    if (!sameOrigin(req)) return bad(res, "Bad origin", 403);
    await prisma.boq.delete({ where: { id } });
    return ok(res, { deleted: true });
  }

  return bad(res, "Method not allowed", 405);
});

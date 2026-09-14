import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, bad, handler, parseBody, apiManagement, sameOrigin, parseId } from "@/lib/api";

const createSchema = z.object({
  name: z.string().min(2).max(100),
  code: z.string().min(2).max(20).transform((v) => v.toUpperCase().trim()),
  address: z.string().min(4).max(200),
  city: z.string().min(2).max(60),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusM: z.number().int().min(50).max(5000).default(150),
  budget: z.number().min(0).default(0),
  managerId: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  status: z.enum(["ACTIVE", "ON_HOLD", "COMPLETED"]).default("ACTIVE"),
});

const updateSchema = createSchema.partial();

export default handler(async (req, res) => {
  if (req.method === "GET") {
    const me = await apiManagement(req, res);
    if (!me) return bad(res, "Forbidden", 403);
    const sites = await prisma.site.findMany({
      include: {
        manager: { select: { id: true, name: true } },
        _count: { select: { members: true, tasks: true } },
      },
      orderBy: { name: "asc" },
    });
    return ok(res, { sites });
  }

  if (req.method === "POST") {
    const me = await apiManagement(req, res);
    if (!me) return bad(res, "Forbidden", 403);
    if (!sameOrigin(req)) return bad(res, "Bad origin", 403);
    const data = await parseBody(req, createSchema);
    const exists = await prisma.site.findUnique({ where: { code: data.code } });
    if (exists) return bad(res, "Site code already exists", 409);
    const site = await prisma.site.create({
      data: {
        ...data,
        managerId: data.managerId || null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
      },
    });
    return ok(res, { site }, 201);
  }

  return bad(res, "Method not allowed", 405);
});

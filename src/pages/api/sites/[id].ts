import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, bad, handler, parseBody, apiManagement, sameOrigin, parseId } from "@/lib/api";

const updateSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  address: z.string().min(4).max(200).optional(),
  city: z.string().min(2).max(60).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  radiusM: z.number().int().min(50).max(5000).optional(),
  budget: z.number().min(0).optional(),
  managerId: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  status: z.enum(["ACTIVE", "ON_HOLD", "COMPLETED"]).optional(),
});

export default handler(async (req, res) => {
  const id = parseId(req);
  if (!id) return bad(res, "Missing id", 400);

  if (req.method === "GET") {
    const me = await apiManagement(req, res);
    if (!me) return bad(res, "Forbidden", 403);
    const site = await prisma.site.findUnique({
      where: { id },
      include: {
        manager: { select: { id: true, name: true, email: true } },
        members: { include: { user: { select: { id: true, name: true, jobTitle: true } } } },
        tasks: { orderBy: { dueDate: "asc" }, include: { assignments: { select: { userId: true, status: true } } } },
        _count: { select: { tasks: true, members: true, attendance: true } },
      },
    });
    if (!site) return bad(res, "Not found", 404);
    return ok(res, { site });
  }

  if (req.method === "PATCH") {
    const me = await apiManagement(req, res);
    if (!me) return bad(res, "Forbidden", 403);
    if (!sameOrigin(req)) return bad(res, "Bad origin", 403);
    const data = await parseBody(req, updateSchema);
    const site = await prisma.site.update({
      where: { id },
      data: {
        ...data,
        startDate: data.startDate !== undefined ? (data.startDate ? new Date(data.startDate) : null) : undefined,
        endDate: data.endDate !== undefined ? (data.endDate ? new Date(data.endDate) : null) : undefined,
      },
    });
    return ok(res, { site });
  }

  if (req.method === "DELETE") {
    const me = await apiManagement(req, res);
    if (!me) return bad(res, "Forbidden", 403);
    if (!sameOrigin(req)) return bad(res, "Bad origin", 403);
    const taskCount = await prisma.task.count({ where: { siteId: id } });
    if (taskCount > 0) {
      return bad(res, "Site has tasks; archive it (set status COMPLETED) instead of deleting", 400);
    }
    await prisma.site.delete({ where: { id } });
    return ok(res, { deleted: true });
  }

  return bad(res, "Method not allowed", 405);
});

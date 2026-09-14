import { prisma } from "@/lib/prisma";
import { ok, bad, handler, apiManagement, apiUser } from "@/lib/api";

export default handler(async (req, res) => {
  if (req.method === "GET") {
    const me = await apiUser(req, res);
    if (!me) return bad(res, "Unauthorized", 401);
    const { from, to, userId, siteId } = req.query;

    const where: Record<string, unknown> = {};
    if (me.role === "EMPLOYEE") {
      where.userId = me.id;
    } else if (typeof userId === "string" && userId !== "ALL") {
      where.userId = userId;
    }
    if (typeof siteId === "string" && siteId !== "ALL") where.siteId = siteId;
    if (typeof from === "string") where.checkInAt = { ...(where.checkInAt as object || {}), gte: new Date(from) };
    if (typeof to === "string") {
      const t = new Date(to);
      t.setHours(23, 59, 59, 999);
      where.checkInAt = { ...(where.checkInAt as object || {}), lte: t };
    }

    const records = await prisma.attendance.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, jobTitle: true } },
        site: { select: { id: true, name: true, code: true } },
      },
      orderBy: { checkInAt: "desc" },
      take: 500,
    });
    return ok(res, { records });
  }
  return bad(res, "Method not allowed", 405);
});

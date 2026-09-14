import { prisma } from "@/lib/prisma";
import { ok, bad, handler, apiUser } from "@/lib/api";

export default handler(async (req, res) => {
  const me = await apiUser(req, res);
  if (!me) return bad(res, "Unauthorized", 401);
  if (req.method !== "GET") return bad(res, "Method not allowed", 405);

  const open = await prisma.attendance.findFirst({
    where: { userId: me.id, checkOutAt: null },
    include: { site: { select: { id: true, name: true, code: true, lat: true, lng: true, radiusM: true, address: true, city: true } } },
    orderBy: { checkInAt: "desc" },
  });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todays = await prisma.attendance.findMany({
    where: { userId: me.id, checkInAt: { gte: todayStart } },
    include: { site: { select: { name: true } } },
    orderBy: { checkInAt: "asc" },
  });

  const deployments = await prisma.deployment.findMany({
    where: { userId: me.id },
    include: { site: { select: { name: true } }, task: { select: { title: true } } },
    orderBy: { startedAt: "desc" },
    take: 10,
  });

  return ok(res, { open, todays, deployments });
});

import { prisma } from "@/lib/prisma";
import { ok, bad, handler, apiUser } from "@/lib/api";

export default handler(async (req, res) => {
  const me = await apiUser(req, res);
  if (!me) return bad(res, "Unauthorized", 401);
  if (req.method !== "GET") return bad(res, "Method not allowed", 405);

  const notifications = await prisma.notification.findMany({
    where: { userId: me.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const unread = notifications.filter((n) => !n.isRead).length;
  return ok(res, { notifications, unread });
});

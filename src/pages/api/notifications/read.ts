import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, bad, handler, parseBody, apiUser } from "@/lib/api";

const schema = z.object({ ids: z.array(z.string()).max(200).optional() });

/** Mark notifications as read (all, or specific ids). */
export default handler(async (req, res) => {
  const me = await apiUser(req, res);
  if (!me) return bad(res, "Unauthorized", 401);
  if (req.method !== "POST") return bad(res, "Method not allowed", 405);

  const { ids } = await parseBody(req, schema);
  await prisma.notification.updateMany({
    where: { userId: me.id, ...(ids && ids.length ? { id: { in: ids } } : {}) },
    data: { isRead: true },
  });
  return ok(res, { success: true });
});

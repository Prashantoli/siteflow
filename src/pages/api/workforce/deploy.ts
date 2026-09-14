import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, bad, handler, parseBody, apiManagement, sameOrigin, apiUser } from "@/lib/api";
import { startDeployment, endDeployment } from "@/lib/workforce";
import { notifyUser, templates } from "@/lib/notify";

const deploySchema = z.object({
  userId: z.string().min(1),
  siteId: z.string().min(1),
  taskId: z.string().optional().nullable(),
  note: z.string().max(200).optional().nullable(),
});

/** POST — deploy a worker to a site (closes any previous deployment). */
export default handler(async (req, res) => {
  const me = await apiManagement(req, res);
  if (!me) return bad(res, "Forbidden", 403);

  if (req.method === "POST") {
    if (!sameOrigin(req)) return bad(res, "Bad origin", 403);
    const data = await parseBody(req, deploySchema);
    const [user, site] = await Promise.all([
      prisma.user.findUnique({ where: { id: data.userId }, select: { id: true, name: true } }),
      prisma.site.findUnique({ where: { id: data.siteId }, select: { id: true, name: true, address: true, city: true } }),
    ]);
    if (!user) return bad(res, "Worker not found", 404);
    if (!site) return bad(res, "Site not found", 404);

    const deployment = await startDeployment(data.userId, data.siteId, data.taskId ?? null, data.note ?? null);

    const tpl = templates.locationAlert(site.name, `${site.address}, ${site.city}`);
    await notifyUser({ userId: data.userId, ...tpl });

    return ok(res, { deployment }, 201);
  }

  if (req.method === "DELETE") {
    if (!sameOrigin(req)) return bad(res, "Bad origin", 403);
    const body = await parseBody(req, z.object({ userId: z.string().min(1) }));
    await endDeployment(body.userId);
    return ok(res, { ended: true });
  }

  return bad(res, "Method not allowed", 405);
});

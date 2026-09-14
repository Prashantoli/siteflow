import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, bad, handler, parseBody, apiManagement, sameOrigin, parseId } from "@/lib/api";

const updateSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  skill: z.string().max(60).optional().nullable(),
  leaderId: z.string().optional().nullable(),
  memberIds: z.array(z.string()).optional(),
});

export default handler(async (req, res) => {
  const id = parseId(req);
  if (!id) return bad(res, "Missing id", 400);

  if (req.method === "PATCH") {
    const me = await apiManagement(req, res);
    if (!me) return bad(res, "Forbidden", 403);
    if (!sameOrigin(req)) return bad(res, "Bad origin", 403);
    const data = await parseBody(req, updateSchema);
    const crew = await prisma.crew.update({
      where: { id },
      data: {
        name: data.name,
        skill: data.skill,
        leaderId: data.leaderId,
        ...(data.memberIds
          ? {
              members: {
                deleteMany: {},
                create: data.memberIds.map((userId) => ({ userId })),
              },
            }
          : {}),
      },
      include: { members: { include: { user: { select: { id: true, name: true } } } } },
    });
    return ok(res, { crew });
  }

  if (req.method === "DELETE") {
    const me = await apiManagement(req, res);
    if (!me) return bad(res, "Forbidden", 403);
    if (!sameOrigin(req)) return bad(res, "Bad origin", 403);
    await prisma.crew.delete({ where: { id } });
    return ok(res, { deleted: true });
  }

  return bad(res, "Method not allowed", 405);
});

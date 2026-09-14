import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, bad, handler, parseBody, apiManagement, apiUser, sameOrigin, parseId } from "@/lib/api";

const createSchema = z.object({
  name: z.string().min(2).max(80),
  skill: z.string().max(60).optional().nullable(),
  leaderId: z.string().optional().nullable(),
  memberIds: z.array(z.string()).default([]),
});

const updateSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  skill: z.string().max(60).optional().nullable(),
  leaderId: z.string().optional().nullable(),
  memberIds: z.array(z.string()).optional(),
});

export default handler(async (req, res) => {
  if (req.method === "GET") {
    const me = await apiUser(req, res);
    if (!me) return bad(res, "Unauthorized", 401);
    const crews = await prisma.crew.findMany({
      include: {
        leader: { select: { id: true, name: true } },
        members: { include: { user: { select: { id: true, name: true, jobTitle: true } } } },
        _count: { select: { tasks: true } },
      },
      orderBy: { name: "asc" },
    });
    return ok(res, { crews });
  }

  if (req.method === "POST") {
    const me = await apiManagement(req, res);
    if (!me) return bad(res, "Forbidden", 403);
    if (!sameOrigin(req)) return bad(res, "Bad origin", 403);
    const data = await parseBody(req, createSchema);
    const crew = await prisma.crew.create({
      data: {
        name: data.name,
        skill: data.skill ?? null,
        leaderId: data.leaderId ?? null,
        members: { create: data.memberIds.map((userId) => ({ userId })) },
      },
      include: { members: true },
    });
    return ok(res, { crew }, 201);
  }

  return bad(res, "Method not allowed", 405);
});

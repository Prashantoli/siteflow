import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, bad, handler, parseBody, apiAdmin, apiUser, sameOrigin, parseId } from "@/lib/api";
import { hashPassword } from "@/lib/auth";

const updateSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  phone: z.string().max(24).optional().nullable(),
  jobTitle: z.string().max(60).optional().nullable(),
  hourlyRate: z.number().min(0).optional(),
  role: z.enum(["ADMIN", "MANAGER", "EMPLOYEE"]).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ON_LEAVE"]).optional(),
  password: z.string().min(6).max(72).optional(),
});

export default handler(async (req, res) => {
  const id = parseId(req);
  if (!id) return bad(res, "Missing id", 400);

  if (req.method === "GET") {
    const me = await apiUser(req, res);
    if (!me) return bad(res, "Unauthorized", 401);
    if (me.id !== id && me.role === "EMPLOYEE") return bad(res, "Forbidden", 403);
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, email: true, phone: true, role: true, jobTitle: true,
        hourlyRate: true, status: true, lastSeenAt: true, createdAt: true,
      },
    });
    if (!user) return bad(res, "Not found", 404);
    return ok(res, { user });
  }

  if (req.method === "PATCH") {
    const me = await apiUser(req, res);
    if (!me) return bad(res, "Unauthorized", 401);
    if (!sameOrigin(req)) return bad(res, "Bad origin", 403);

    const data = await parseBody(req, updateSchema);

    // Employees may only update themselves and only profile fields (not role/status/rate)
    if (me.role === "EMPLOYEE") {
      if (me.id !== id) return bad(res, "Forbidden", 403);
      if (data.role || data.status || data.hourlyRate !== undefined) return bad(res, "Forbidden", 403);
    }

    // Only admins can change role/status/rate/other users
    if (me.role !== "ADMIN") {
      if (me.id !== id) return bad(res, "Forbidden", 403);
      if (data.role || data.status || data.hourlyRate !== undefined) return bad(res, "Forbidden", 403);
    }

    const { password, ...rest } = data;
    const update: Record<string, unknown> = { ...rest };
    if (password) update.passwordHash = hashPassword(password);

    const user = await prisma.user.update({
      where: { id },
      data: update,
      select: { id: true, name: true, email: true, role: true, status: true },
    });
    return ok(res, { user });
  }

  if (req.method === "DELETE") {
    const admin = await apiAdmin(req, res);
    if (!admin) return bad(res, "Forbidden", 403);
    if (!sameOrigin(req)) return bad(res, "Bad origin", 403);
    if (admin.id === id) return bad(res, "You cannot delete your own account", 400);

    // Soft-delete: deactivate to preserve historical records
    const user = await prisma.user.update({ where: { id }, data: { status: "INACTIVE" } });
    return ok(res, { user: { id: user.id, status: user.status } });
  }

  return bad(res, "Method not allowed", 405);
});

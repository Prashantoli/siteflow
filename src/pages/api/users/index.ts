import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, bad, handler, parseBody, apiAdmin, apiManagement, sameOrigin } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { Role, EmployeeStatus } from "@prisma/client";

const createSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email().transform((v) => v.toLowerCase().trim()),
  password: z.string().min(6).max(72),
  role: z.enum(["ADMIN", "MANAGER", "EMPLOYEE"]),
  phone: z.string().max(24).optional().nullable(),
  jobTitle: z.string().max(60).optional().nullable(),
  hourlyRate: z.number().min(0).default(0),
});

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
  if (req.method === "GET") {
    const me = await apiManagement(req, res);
    if (!me) return bad(res, "Forbidden", 403);

    const { role, status, q } = req.query;
    const where: Record<string, unknown> = {};
    if (role === "EMPLOYEE" || role === "MANAGER" || role === "ADMIN") where.role = role;
    if (status === "ACTIVE" || status === "INACTIVE" || status === "ON_LEAVE") where.status = status;
    if (typeof q === "string" && q.length > 0) {
      where.OR = [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }];
    }
    const users = await prisma.user.findMany({
      where,
      select: {
        id: true, name: true, email: true, phone: true, role: true, jobTitle: true,
        hourlyRate: true, status: true, lastSeenAt: true, createdAt: true,
      },
      orderBy: { name: "asc" },
    });
    return ok(res, { users });
  }

  if (req.method === "POST") {
    const admin = await apiAdmin(req, res);
    if (!admin) return bad(res, "Forbidden", 403);
    if (!sameOrigin(req)) return bad(res, "Bad origin", 403);
    const data = await parseBody(req, createSchema);
    const exists = await prisma.user.findUnique({ where: { email: data.email } });
    if (exists) return bad(res, "Email already in use", 409);
    const user = await prisma.user.create({
      data: { ...data, role: data.role as Role, passwordHash: hashPassword(data.password) },
      select: { id: true, name: true, email: true, role: true },
    });
    return ok(res, { user }, 201);
  }

  return bad(res, "Method not allowed", 405);
});

import { prisma } from "@/lib/prisma";
import { ok, bad, handler, parseBody, sameOrigin } from "@/lib/api";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";

const schema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email().transform((v) => v.toLowerCase().trim()),
  password: z.string().min(6).max(72),
  role: z.enum(["ADMIN", "MANAGER", "EMPLOYEE"]),
  phone: z.string().max(24).optional(),
  jobTitle: z.string().max(60).optional(),
  hourlyRate: z.number().min(0).optional(),
});

export default handler(async (req, res) => {
  if (req.method !== "POST") return bad(res, "Method not allowed", 405);
  if (!sameOrigin(req)) return bad(res, "Bad origin", 403);

  // First-run bootstrap: allow creating the first admin with no session.
  const userCount = await prisma.user.count();
  const bootstrap = userCount === 0;

  if (!bootstrap) {
    // otherwise only ADMIN can create users
    const { getSessionUser } = await import("@/lib/rbac");
    const me = await getSessionUser(req, res);
    if (!me || me.role !== "ADMIN") return bad(res, "Forbidden", 403);
  }

  const data = await parseBody(req, schema);
  const exists = await prisma.user.findUnique({ where: { email: data.email } });
  if (exists) return bad(res, "A user with this email already exists", 409);

  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      phone: data.phone,
      jobTitle: data.jobTitle,
      hourlyRate: data.hourlyRate ?? 0,
      role: data.role as Role,
      passwordHash: bcrypt.hashSync(data.password, 10),
    },
    select: { id: true, name: true, email: true, role: true },
  });

  return ok(res, { user }, 201);
});

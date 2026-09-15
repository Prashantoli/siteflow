import { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { ok, bad } from "@/lib/api";
import { apiManagement } from "@/lib/api";

/** GET /api/reports/employees?from=YYYY-MM-DD&to=YYYY-MM-DD — performance per employee. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const me = await apiManagement(req, res);
    if (!me) return bad(res, "Forbidden", 403);

    const from = typeof req.query.from === "string" && req.query.from ? new Date(`${req.query.from}T00:00:00`) : null;
    const to = typeof req.query.to === "string" && req.query.to ? new Date(`${req.query.to}T23:59:59.999`) : null;
    const attWhere = from || to ? { checkInAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : undefined;

    const users = await prisma.user.findMany({
      where: { role: "EMPLOYEE" },
      include: {
        assignments: { include: { task: { select: { status: true, dueDate: true, startDate: true } } } },
        attendance: { select: { workedMinutes: true, status: true, checkInAt: true }, where: attWhere },
      },
      orderBy: { name: "asc" },
    });

    const employees = users.map((u) => ({
      id: u.id,
      name: u.name,
      jobTitle: u.jobTitle,
      status: u.status,
      completed: u.assignments.filter((a) => a.status === "COMPLETED").length,
      open: u.assignments.filter((a) => a.status !== "COMPLETED").length,
      hours: +(u.attendance.reduce((s, a) => s + a.workedMinutes, 0) / 60).toFixed(1),
      lateDays: u.attendance.filter((a) => a.status === "LATE").length,
      hourlyRate: u.hourlyRate,
    }));

    return ok(res, { employees });
  } catch (e) {
    console.error("[reports/employees]", e);
    return bad(res, "Internal server error", 500);
  }
}

import { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { ok, bad } from "@/lib/api";
import { apiManagement } from "@/lib/api";

/** GET /api/reports/sites?from=YYYY-MM-DD&to=YYYY-MM-DD — progress/productivity per site. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const me = await apiManagement(req, res);
    if (!me) return bad(res, "Forbidden", 403);

    const from = typeof req.query.from === "string" && req.query.from ? new Date(`${req.query.from}T00:00:00`) : null;
    const to = typeof req.query.to === "string" && req.query.to ? new Date(`${req.query.to}T23:59:59.999`) : null;
    const taskWhere = from || to ? { dueDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : undefined;

    const sites = await prisma.site.findMany({
      include: { tasks: { where: taskWhere, select: { status: true, progress: true } }, members: { select: { id: true } } },
      orderBy: { name: "asc" },
    });

    const rows = sites.map((s) => {
      const done = s.tasks.filter((t) => t.status === "COMPLETED").length;
      const progress = s.tasks.length ? Math.round(s.tasks.reduce((a, t) => a + t.progress, 0) / s.tasks.length) : 0;
      return {
        id: s.id, name: s.name, code: s.code, status: s.status,
        workers: s.members.length, tasks: s.tasks.length, done, progress,
        budget: s.budget,
      };
    });

    return ok(res, { sites: rows });
  } catch (e) {
    console.error("[reports/sites]", e);
    return bad(res, "Internal server error", 500);
  }
}

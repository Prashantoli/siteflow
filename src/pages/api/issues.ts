import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, bad, handler, parseBody, apiUser, sameOrigin } from "@/lib/api";
import { notifyUser } from "@/lib/notify";
import { IssueStatus } from "@prisma/client";

const raiseSchema = z.object({
  title: z.string().min(3).max(140),
  description: z.string().max(2000).optional().nullable(),
  category: z.enum(["SAFETY", "EQUIPMENT", "MATERIAL", "SITE", "PAYROLL", "OTHER"]).default("OTHER"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  siteId: z.string().optional().nullable(),
  taskId: z.string().optional().nullable(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["OPEN", "IN_REVIEW", "RESOLVED", "DISMISSED"]),
  resolutionNote: z.string().max(1000).optional().nullable(),
});

const include = {
  site: { select: { id: true, name: true, code: true } },
  task: { select: { id: true, title: true } },
  raisedBy: { select: { id: true, name: true, jobTitle: true } },
  resolvedBy: { select: { id: true, name: true } },
};

/** Any authenticated user can raise issues; managers see all, employees see their own. */
export default handler(async (req, res) => {
  const me = await apiUser(req, res);
  if (!me) return bad(res, "Unauthorized", 401);
  const isManager = me.role === "ADMIN" || me.role === "MANAGER";

  if (req.method === "GET") {
    const issues = await prisma.issue.findMany({
      where: isManager ? {} : { raisedById: me.id },
      include,
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    return ok(res, { issues });
  }

  if (req.method === "POST") {
    if (!sameOrigin(req)) return bad(res, "Bad origin", 403);
    const data = await parseBody(req, raiseSchema);

    if (data.siteId) {
      const site = await prisma.site.findUnique({ where: { id: data.siteId }, select: { id: true } });
      if (!site) return bad(res, "Site not found", 404);
    }
    if (data.taskId) {
      const task = await prisma.task.findUnique({ where: { id: data.taskId }, select: { id: true } });
      if (!task) return bad(res, "Task not found", 404);
    }

    const issue = await prisma.issue.create({
      data: {
        title: data.title,
        description: data.description ?? null,
        category: data.category,
        priority: data.priority,
        siteId: data.siteId ?? null,
        taskId: data.taskId ?? null,
        raisedById: me.id,
      },
      include,
    });

    // Notify managers (and the site manager specifically when known)
    const managers = await prisma.user.findMany({
      where: { role: { in: ["ADMIN", "MANAGER"] }, status: "ACTIVE" },
      select: { id: true },
    });
    await Promise.allSettled(
      managers.map((m) =>
        notifyUser({
          userId: m.id,
          title: `New issue raised: ${issue.title}`,
          body: `${me.name} reported a ${data.category.toLowerCase()} issue${issue.site ? ` at ${issue.site.name}` : ""}${data.priority === "URGENT" ? " — URGENT" : ""}`,
          type: "SYSTEM",
          link: "/portal/issues",
          email: data.priority === "HIGH" || data.priority === "URGENT",
          sms: data.priority === "URGENT",
        })
      )
    );

    await prisma.activityLog.create({
      data: { userId: me.id, action: "ISSUE_RAISED", entity: "Issue", entityId: issue.id, detail: issue.title },
    });

    return ok(res, { issue }, 201);
  }

  if (req.method === "PATCH") {
    if (!isManager) return bad(res, "Only managers can update issues", 403);
    if (!sameOrigin(req)) return bad(res, "Bad origin", 403);
    const data = await parseBody(req, updateSchema);

    const existing = await prisma.issue.findUnique({ where: { id: data.id } });
    if (!existing) return bad(res, "Issue not found", 404);

    const issue = await prisma.issue.update({
      where: { id: data.id },
      data: {
        status: data.status as IssueStatus,
        resolutionNote: data.resolutionNote !== undefined ? data.resolutionNote : existing.resolutionNote,
        resolvedById: data.status === "RESOLVED" || data.status === "DISMISSED" ? me.id : null,
        resolvedAt: data.status === "RESOLVED" || data.status === "DISMISSED" ? new Date() : null,
      },
      include,
    });

    // Tell the raiser their issue was actioned
    if (issue.raisedById !== me.id) {
      await notifyUser({
        userId: issue.raisedById,
        title: `Issue ${data.status.toLowerCase().replace("_", " ")}: ${issue.title}`,
        body: data.resolutionNote || `${me.name} updated your issue status to ${data.status}.`,
        type: "SYSTEM",
        link: "/portal/my-day",
      }).catch(() => undefined);
    }

    return ok(res, { issue });
  }

  return bad(res, "Method not allowed", 405);
});

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, bad, handler, parseBody, apiManagement, apiUser, sameOrigin } from "@/lib/api";
import { notifyMany, templates } from "@/lib/notify";
import { notifyUser } from "@/lib/notify";
import { startDeployment } from "@/lib/workforce";
import { TaskStatus, TaskPriority } from "@prisma/client";

const createSchema = z.object({
  title: z.string().min(3).max(140),
  description: z.string().max(2000).optional().nullable(),
  siteId: z.string().min(1).optional().nullable(), // optional — managers can self-assign without a site
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  startDate: z.string(),
  dueDate: z.string(),
  estimatedHours: z.number().min(0).max(1000).default(0),
  crewId: z.string().optional().nullable(),
  assigneeIds: z.array(z.string()).default([]),
  notify: z.boolean().default(true),
  deployNow: z.boolean().default(false),
});

const listQuery = z.object({
  siteId: z.string().optional(),
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "COMPLETED"]).optional(),
  mine: z.string().optional(),
});

export default handler(async (req, res) => {
  if (req.method === "GET") {
    const me = await apiUser(req, res);
    if (!me) return bad(res, "Unauthorized", 401);
    const q = listQuery.parse(req.query);

    const where: Record<string, unknown> = {};
    if (q.siteId) where.siteId = q.siteId;
    if (q.status) where.status = q.status;
    if (q.mine === "1" && me.role === "EMPLOYEE") {
      where.assignments = { some: { userId: me.id } };
    }

    const tasks = await prisma.task.findMany({
      where,
      include: {
        site: { select: { id: true, name: true, code: true } },
        crew: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        assignments: {
          include: { user: { select: { id: true, name: true, jobTitle: true } } },
        },
      },
      orderBy: { dueDate: "asc" },
    });

    // employees only see their own tasks
    const visible = me.role === "EMPLOYEE" ? tasks.filter((t) => t.assignments.some((a) => a.userId === me.id)) : tasks;
    return ok(res, { tasks: visible });
  }

  if (req.method === "POST") {
    const me = await apiManagement(req, res);
    if (!me) return bad(res, "Forbidden", 403);
    if (!sameOrigin(req)) return bad(res, "Bad origin", 403);
    const data = await parseBody(req, createSchema);

    let site: { id: string; name: string; address: string; city: string } | null = null;
    if (data.siteId) {
      site = await prisma.site.findUnique({
        where: { id: data.siteId },
        select: { id: true, name: true, address: true, city: true },
      });
      if (!site) return bad(res, "Site not found", 404);
    }
    if (!data.siteId && data.assigneeIds.length === 0) {
      return bad(res, "A task needs a site or at least one assignee", 422);
    }
    const isSelfAssigned = data.assigneeIds.includes(me.id);

    const start = new Date(data.startDate);
    const due = new Date(data.dueDate);
    if (due < start) return bad(res, "Due date cannot be before start date", 422);

    const task = await prisma.task.create({
      data: {
        title: data.title,
        description: data.description ?? null,
        siteId: data.siteId ?? null,
        priority: data.priority as TaskPriority,
        startDate: start,
        dueDate: due,
        estimatedHours: data.estimatedHours,
        crewId: data.crewId ?? null,
        createdById: me.id,
        assignments: { create: data.assigneeIds.map((userId) => ({ userId })) },
      },
      include: { assignments: true, site: { select: { name: true } } },
    });

    if (data.notify) {
      const recipients = data.assigneeIds.filter((id) => id !== me.id); // don't notify yourself
      if (recipients.length > 0) {
        const siteName = site?.name ?? "(no site)";
        const tpl = templates.taskAssigned(task.title, siteName, due);
        await notifyMany(recipients, {
          ...tpl,
          email: true,
          sms: data.priority === "URGENT",
        });
        // location alert with exact site address
        if (site) {
          const loc = templates.locationAlert(site.name, `${site.address}, ${site.city}`);
          await notifyMany(recipients, { ...loc });
        }
      }
    }

    if (data.deployNow && site) {
      for (const userId of data.assigneeIds) {
        await startDeployment(userId, site.id, task.id);
      }
    }

    await prisma.activityLog.create({
      data: { userId: me.id, action: "TASK_CREATED", entity: "Task", entityId: task.id, detail: task.title },
    });

    return ok(res, { task }, 201);
  }

  return bad(res, "Method not allowed", 405);
});

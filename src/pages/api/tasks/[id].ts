import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, bad, handler, parseBody, apiUser, apiManagement, sameOrigin, parseId } from "@/lib/api";
import { notifyUser, templates } from "@/lib/notify";
import { TaskStatus } from "@prisma/client";

const updateSchema = z.object({
  title: z.string().min(3).max(140).optional(),
  description: z.string().max(2000).optional().nullable(),
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  estimatedHours: z.number().min(0).max(1000).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  crewId: z.string().optional().nullable(),
  assigneeIds: z.array(z.string()).optional(),
  notify: z.boolean().optional(),
});

export default handler(async (req, res) => {
  const id = parseId(req);
  if (!id) return bad(res, "Missing id", 400);

  if (req.method === "GET") {
    const me = await apiUser(req, res);
    if (!me) return bad(res, "Unauthorized", 401);
    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        site: true,
        crew: true,
        createdBy: { select: { id: true, name: true } },
        assignments: { include: { user: { select: { id: true, name: true, jobTitle: true } } } },
      },
    });
    if (!task) return bad(res, "Not found", 404);
    if (me.role === "EMPLOYEE" && !task.assignments.some((a) => a.userId === me.id)) {
      return bad(res, "Forbidden", 403);
    }
    return ok(res, { task });
  }

  if (req.method === "PATCH") {
    const me = await apiUser(req, res);
    if (!me) return bad(res, "Unauthorized", 401);
    if (!sameOrigin(req)) return bad(res, "Bad origin", 403);
    const data = await parseBody(req, updateSchema);

    const existing = await prisma.task.findUnique({
      where: { id },
      include: { assignments: { select: { userId: true } }, site: true },
    });
    if (!existing) return bad(res, "Not found", 404);

    const isAssignee = existing.assignments.some((a) => a.userId === me.id);
    const isManager = me.role === "ADMIN" || me.role === "MANAGER";

    if (!isManager && !isAssignee) return bad(res, "Forbidden", 403);

    // Employees may only update status/progress on their tasks
    const managerFields = ["title", "description", "priority", "startDate", "dueDate", "estimatedHours", "crewId", "assigneeIds"] as const;
    if (!isManager && managerFields.some((f) => (data as Record<string, unknown>)[f] !== undefined)) {
      return bad(res, "Only managers can edit task details", 403);
    }

    const now = new Date();
    const update: Record<string, unknown> = {};

    if (data.title !== undefined) update.title = data.title;
    if (data.description !== undefined) update.description = data.description;
    if (data.priority !== undefined) update.priority = data.priority;
    if (data.startDate !== undefined) update.startDate = new Date(data.startDate);
    if (data.dueDate !== undefined) update.dueDate = new Date(data.dueDate);
    if (data.estimatedHours !== undefined) update.estimatedHours = data.estimatedHours;
    if (data.crewId !== undefined) update.crewId = data.crewId;

    // status / progress logic
    const newStatus = data.status as TaskStatus | undefined;
    const newProgress = data.progress;
    if (newStatus) {
      update.status = newStatus;
      if (newStatus === "COMPLETED") {
        update.progress = 100;
        update.completedAt = now;
      } else if (newStatus === "IN_PROGRESS") {
        update.completedAt = null;
        if ((newProgress ?? existing.progress) === 0) update.progress = 5;
      } else {
        update.completedAt = null;
      }
    }
    if (newProgress !== undefined) {
      update.progress = newProgress;
      if (newStatus === undefined) {
        // infer status from progress
        if (newProgress >= 100) {
          update.status = "COMPLETED";
          update.completedAt = now;
        } else if (newProgress > 0 && existing.status === "NOT_STARTED") {
          update.status = "IN_PROGRESS";
        }
      }
    }

    const task = await prisma.task.update({ where: { id }, data: update });

    // keep assignments in sync when a manager updates overall status
    if (isManager && newStatus) {
      await prisma.taskAssignment.updateMany({ where: { taskId: id }, data: { status: newStatus } });
      if (newProgress !== undefined) {
        await prisma.taskAssignment.updateMany({ where: { taskId: id }, data: { progress: newProgress } });
      }
    }
    if (isManager && newProgress !== undefined && newStatus === undefined) {
      const st = (update.status as TaskStatus) ?? existing.status;
      await prisma.taskAssignment.updateMany({ where: { taskId: id }, data: { progress: newProgress, status: st } });
    }

    // membership changes (manager only)
    if (isManager && data.assigneeIds) {
      await prisma.taskAssignment.deleteMany({ where: { taskId: id, userId: { notIn: data.assigneeIds } } });
      for (const userId of data.assigneeIds) {
        await prisma.taskAssignment.upsert({
          where: { taskId_userId: { taskId: id, userId } },
          update: {},
          create: { taskId: id, userId },
        });
      }
      if (data.notify) {
        const added = data.assigneeIds.filter((uid) => !existing.assignments.some((a) => a.userId === uid));
        if (added.length > 0) {
          const tpl = templates.taskAssigned(task.title, existing.site.name, task.dueDate);
          await Promise.allSettled(
            added.map((userId) =>
              notifyUser({ userId, ...tpl, email: true, sms: task.priority === "URGENT" })
            )
          );
        }
      }
    }

    // notify manager(s) when an employee completes their task
    if (newStatus === "COMPLETED" && !isManager) {
      const managers = await prisma.user.findMany({
        where: { role: { in: ["ADMIN", "MANAGER"] }, status: "ACTIVE" },
        select: { id: true },
      });
      await Promise.allSettled(
        managers.map((m) =>
          notifyUser({
            userId: m.id,
            title: "Task completed",
            body: `${me.name} completed "${task.title}" at ${existing.site.name}`,
            type: "SYSTEM",
            link: "/portal/tasks",
          })
        )
      );
    }

    await prisma.activityLog.create({
      data: { userId: me.id, action: "TASK_UPDATED", entity: "Task", entityId: id, detail: task.title },
    });

    return ok(res, { task });
  }

  if (req.method === "DELETE") {
    const me = await apiManagement(req, res);
    if (!me) return bad(res, "Forbidden", 403);
    if (!sameOrigin(req)) return bad(res, "Bad origin", 403);
    await prisma.task.delete({ where: { id } });
    return ok(res, { deleted: true });
  }

  return bad(res, "Method not allowed", 405);
});

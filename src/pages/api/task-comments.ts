import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, bad, handler, parseBody, apiUser, sameOrigin } from "@/lib/api";
import { notifyUser } from "@/lib/notify";

const postSchema = z.object({
  taskId: z.string().min(1),
  body: z.string().min(1).max(2000),
});

/** GET /api/task-comments?taskId=… — comment thread for a task. */
export default handler(async (req, res) => {
  const me = await apiUser(req, res);
  if (!me) return bad(res, "Unauthorized", 401);

  if (req.method === "GET") {
    const taskId = typeof req.query.taskId === "string" ? req.query.taskId : "";
    if (!taskId) return bad(res, "Missing taskId", 400);

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { assignments: { select: { userId: true } } },
    });
    if (!task) return bad(res, "Task not found", 404);
    // Employees can only read threads on their own tasks
    if (me.role === "EMPLOYEE" && !task.assignments.some((a) => a.userId === me.id)) {
      return bad(res, "Forbidden", 403);
    }

    const comments = await prisma.taskComment.findMany({
      where: { taskId },
      include: { user: { select: { id: true, name: true, role: true, jobTitle: true } } },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    return ok(res, { comments });
  }

  if (req.method === "POST") {
    if (!sameOrigin(req)) return bad(res, "Bad origin", 403);
    const data = await parseBody(req, postSchema);

    const task = await prisma.task.findUnique({
      where: { id: data.taskId },
      include: {
        assignments: { select: { userId: true } },
        site: { select: { id: true, name: true, managerId: true } },
      },
    });
    if (!task) return bad(res, "Task not found", 404);

    const isManager = me.role === "ADMIN" || me.role === "MANAGER";
    const isAssignee = task.assignments.some((a) => a.userId === me.id);
    if (!isManager && !isAssignee) return bad(res, "Forbidden", 403);

    const comment = await prisma.taskComment.create({
      data: { taskId: task.id, userId: me.id, body: data.body },
      include: { user: { select: { id: true, name: true, role: true, jobTitle: true } } },
    });

    // Worker comments → notify site manager (fallback: all active managers).
    // Manager comments → notify the assigned workers.
    if (!isManager) {
      const recipients = await prisma.user.findMany({
        where: {
          role: { in: ["ADMIN", "MANAGER"] },
          status: "ACTIVE",
          ...(task.site && task.site.managerId ? { OR: [{ id: task.site.managerId }, { managedSites: { some: { id: task.site.id } } }] } : {}),
        },
        select: { id: true },
      });
      const targets = recipients.length > 0 ? recipients : await prisma.user.findMany({ where: { role: { in: ["ADMIN", "MANAGER"] }, status: "ACTIVE" }, select: { id: true } });
      await Promise.allSettled(
        targets.map((m) =>
          notifyUser({
            userId: m.id,
            title: `New comment on "${task.title}"`,
            body: `${me.name}: ${data.body.slice(0, 140)}`,
            type: "SYSTEM",
            link: "/portal/tasks",
          })
        )
      );
    } else {
      const workerIds = task.assignments.map((a) => a.userId).filter((id) => id !== me.id);
      await Promise.allSettled(
        workerIds.map((userId) =>
          notifyUser({
            userId,
            title: `Manager update on "${task.title}"`,
            body: `${me.name}: ${data.body.slice(0, 140)}`,
            type: "SYSTEM",
            link: "/portal/my-day",
          })
        )
      );
    }

    return ok(res, { comment }, 201);
  }

  return bad(res, "Method not allowed", 405);
});

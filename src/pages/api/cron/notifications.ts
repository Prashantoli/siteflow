import { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { bad } from "@/lib/api";
import { notifyUser, templates } from "@/lib/notify";

/**
 * GET|POST /api/cron/notifications
 * Scheduled job (Vercel cron every 15 min, or any external cron with CRON_SECRET):
 *  1. Sends shift reminders to workers with a task starting within
 *     notifications.reminderHours (default 2h).
 *  2. Alerts managers about overdue tasks.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Vercel cron sends Authorization: Bearer CRON_SECRET
    const auth = req.headers.authorization;
    const secret = process.env.CRON_SECRET;
    if (secret && auth !== `Bearer ${secret}`) {
      return bad(res, "Unauthorized", 401);
    }

    const settings = await prisma.appSetting.findMany();
    const reminderHours = Number(settings.find((s) => s.key === "notifications.reminderHours")?.value ?? 2);

    const now = new Date();
    const window = new Date(now.getTime() + reminderHours * 3_600_000);
    let sentReminders = 0;
    let sentOverdue = 0;

    // 1) shift reminders for tasks starting inside the window
    const startingTasks = await prisma.task.findMany({
      where: { status: "NOT_STARTED", startDate: { gte: now, lte: window } },
      include: { site: true, assignments: true },
    });
    for (const task of startingTasks) {
      for (const a of task.assignments) {
        const recent = await prisma.notification.findFirst({
          where: {
            userId: a.userId,
            type: "REMINDER",
            createdAt: { gte: new Date(now.getTime() - 12 * 3_600_000) },
            body: { contains: task.title },
          },
        });
        if (recent) continue;
        const tpl = templates.shiftReminder(task.site.name, task.startDate);
        await notifyUser({ userId: a.userId, ...tpl, email: true });
        sentReminders++;
      }
    }

    // 2) overdue tasks → notify managers once per day
    const overdueTasks = await prisma.task.findMany({
      where: { status: { not: "COMPLETED" }, dueDate: { lt: now } },
      include: { site: true },
    });
    if (overdueTasks.length > 0) {
      const managers = await prisma.user.findMany({
        where: { role: { in: ["ADMIN", "MANAGER"] }, status: "ACTIVE" },
        select: { id: true },
      });
      for (const m of managers) {
        const today = await prisma.notification.findFirst({
          where: {
            userId: m.id,
            title: "Overdue tasks alert",
            createdAt: { gte: new Date(now.getTime() - 20 * 3_600_000) },
          },
        });
        if (today) continue;
        await notifyUser({
          userId: m.id,
          title: "Overdue tasks alert",
          body: `${overdueTasks.length} task(s) are past their deadline: ${overdueTasks.slice(0, 5).map((t) => t.title).join(", ")}${overdueTasks.length > 5 ? "…" : ""}`,
          type: "SYSTEM",
          link: "/portal/tasks",
          email: true,
        });
        sentOverdue++;
      }
    }

    return res.status(200).json({ ok: true, sentReminders, sentOverdue, checkedAt: now.toISOString() });
  } catch (e) {
    console.error("[cron]", e);
    return bad(res, "Internal server error", 500);
  }
}

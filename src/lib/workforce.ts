import { prisma } from "@/lib/prisma";
import { TaskStatus } from "@prisma/client";

export type WorkerStatus = "FREE" | "BUSY" | "OFFLINE";

export type WorkerCard = {
  id: string;
  name: string;
  jobTitle: string | null;
  role: string;
  status: EmployeeStatusStr;
  hourlyRate: number;
  lastSeenAt: string | null;
  lat: number | null;
  lng: number | null;
  current: {
    siteId: string | null;
    siteName: string | null;
    siteLat: number | null;
    siteLng: number | null;
    taskId: string | null;
    taskTitle: string | null;
    taskStatus: string | null;
    since: string | null;
  };
  openTasks: number;
};

type EmployeeStatusStr = "ACTIVE" | "INACTIVE" | "ON_LEAVE";

/**
 * A worker is BUSY if they have an active deployment or an open task
 * assignment (not completed). FREE = active user, no open work.
 */
export async function getWorkforceBoard() {
  const workers = await prisma.user.findMany({
    where: { role: "EMPLOYEE" },
    include: {
      deployments: {
        where: { endedAt: null },
        include: { site: { select: { name: true, lat: true, lng: true } }, task: { select: { title: true, status: true } } },
        take: 1,
        orderBy: { startedAt: "desc" },
      },
      assignments: {
        where: { task: { status: { not: TaskStatus.COMPLETED } } },
        include: { task: { select: { id: true, title: true, status: true, siteId: true } } },
      },
    },
    orderBy: { name: "asc" },
  });

  const cards: WorkerCard[] = workers.map((w) => {
    const dep = w.deployments[0];
    const open = w.assignments;
    const busy = !!dep || open.length > 0;
    return {
      id: w.id,
      name: w.name,
      jobTitle: w.jobTitle,
      role: w.role,
      status: w.status as EmployeeStatusStr,
      hourlyRate: w.hourlyRate,
      lastSeenAt: w.lastSeenAt ? w.lastSeenAt.toISOString() : null,
      lat: w.lastLat,
      lng: w.lastLng,
      current: {
        siteId: dep?.siteId ?? null,
        siteName: dep?.site?.name ?? null,
        siteLat: dep?.site?.lat ?? null,
        siteLng: dep?.site?.lng ?? null,
        taskId: dep?.taskId ?? open[0]?.task.id ?? null,
        taskTitle: dep?.task?.title ?? open[0]?.task.title ?? null,
        taskStatus: dep?.task?.status ?? open[0]?.task.status ?? null,
        since: dep ? dep.startedAt.toISOString() : null,
      },
      openTasks: open.length,
    };
  });

  const busyCount = cards.filter((c) => c.status === "ACTIVE" && c.current.siteId).length;
  const freeCount = cards.filter((c) => c.status === "ACTIVE" && !c.current.siteId).length;
  const offline = cards.filter((c) => c.status !== "ACTIVE").length;

  return { cards, busyCount, freeCount, offline };
}

export async function startDeployment(userId: string, siteId: string, taskId?: string | null, note?: string | null) {
  // close any open deployment
  await prisma.deployment.updateMany({ where: { userId, endedAt: null }, data: { endedAt: new Date() } });
  return prisma.deployment.create({
    data: { userId, siteId, taskId: taskId ?? null, note: note ?? null, startedAt: new Date() },
  });
}

export async function endDeployment(userId: string) {
  return prisma.deployment.updateMany({ where: { userId, endedAt: null }, data: { endedAt: new Date() } });
}

export const TASK_STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: "Not Started",
  IN_PROGRESS: "In Progress",
  BLOCKED: "Blocked",
  COMPLETED: "Completed",
};

export const TASK_STATUS_COLOR: Record<string, string> = {
  NOT_STARTED: "bg-slate-100 text-slate-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  BLOCKED: "bg-red-100 text-red-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
};

export const PRIORITY_COLOR: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-600",
  MEDIUM: "bg-blue-100 text-blue-700",
  HIGH: "bg-orange-100 text-orange-700",
  URGENT: "bg-red-100 text-red-700",
};

import { GetServerSidePropsContext } from "next";
import { getSession } from "next-auth/react";
import { prisma } from "@/lib/prisma";
import { homeFor } from "@/lib/rbac";
import Shell from "@/components/Shell";
import { Badge, Progress, fmtDate, fmtTime, minutesToHm } from "@/components/ui";
import { TASK_STATUS_LABEL, TASK_STATUS_COLOR, PRIORITY_COLOR } from "@/lib/workforce";
import MyDayClient, { MyTask } from "@/components/MyDayClient";

export default function MyDay({
  worker,
  tasks,
  openShift,
  todays,
  deployments,
  sites,
  canSelfAssign,
  meId,
}: {
  worker: { name: string; jobTitle: string | null };
  tasks: MyTask[];
  openShift: null | { siteName: string; checkInAt: string };
  todays: { id: string; site: string; checkInAt: string; checkOutAt: string | null; workedMinutes: number; status: string }[];
  deployments: { id: string; site: string; task: string | null; startedAt: string; endedAt: string | null }[];
  sites: { id: string; name: string; code: string; lat: number; lng: number; radiusM: number; address: string; city: string }[];
  canSelfAssign: boolean;
  meId: string;
}) {
  return (
    <Shell title="My Day" subtitle={`${worker.name}${worker.jobTitle ? " · " + worker.jobTitle : ""}`}>
      <MyDayClient
        tasks={tasks}
        openShift={openShift}
        todays={todays}
        sites={sites}
        canSelfAssign={canSelfAssign}
        meId={meId}
      />

      {/* Schedule preview */}
      <div className="card mt-6 p-4">
        <h3 className="mb-3 text-sm font-bold text-slate-800">My Schedule — This Week</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tasks.filter((t) => new Date(t.dueDate) >= new Date()).slice(0, 6).map((t) => (
            <div key={t.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">{t.title}</p>
                <Badge className={TASK_STATUS_COLOR[t.status]}>{TASK_STATUS_LABEL[t.status]}</Badge>
              </div>
              <p className="mt-1 text-xs text-slate-500">📍 {t.siteName}</p>
              <p className="text-xs text-slate-500">🗓 {fmtDate(t.startDate)} → {fmtDate(t.dueDate)}</p>
              <div className="mt-2"><Progress value={t.progress} /></div>
            </div>
          ))}
          {tasks.length === 0 && <p className="text-sm text-slate-400">No assignments this week — enjoy!</p>}
        </div>
      </div>

      {/* Deployment history */}
      <div className="card mt-6 p-4">
        <h3 className="mb-3 text-sm font-bold text-slate-800">My Deployment History</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead><tr><th className="th">Site</th><th className="th">Task</th><th className="th">From</th><th className="th">To</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {deployments.map((d) => (
                <tr key={d.id}>
                  <td className="td font-medium">{d.site}</td>
                  <td className="td">{d.task ?? "—"}</td>
                  <td className="td">{fmtDate(d.startedAt)} {fmtTime(d.startedAt)}</td>
                  <td className="td">{d.endedAt ? `${fmtDate(d.endedAt)} ${fmtTime(d.endedAt)}` : <Badge className="bg-emerald-100 text-emerald-700">Current</Badge>}</td>
                </tr>
              ))}
              {deployments.length === 0 && <tr><td className="td text-slate-400" colSpan={4}>No deployment history yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
  const session = await getSession(ctx);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  const meId = session.user.id;

  const me = await prisma.user.findUnique({
    where: { id: meId },
    select: { name: true, jobTitle: true, role: true },
  });
  if (!me) return { redirect: { destination: "/login", permanent: false } };
  // Managers/admins can preview the worker portal too
  void homeFor;
  const canSelfAssign = me.role === "ADMIN" || me.role === "MANAGER";

  const assignments = await prisma.taskAssignment.findMany({
    where: { userId: meId },
    include: {
      task: {
        include: {
          site: { select: { id: true, name: true, code: true } },
          crew: { select: { name: true } },
        },
      },
    },
    orderBy: { task: { dueDate: "asc" } },
  });

  const tasks: MyTask[] = assignments.map((a) => ({
    id: a.task.id,
    title: a.task.title,
    description: a.task.description,
    status: a.status,
    progress: a.progress,
    priority: a.task.priority,
    siteId: a.task.site?.id ?? "",
    siteName: a.task.site?.name ?? "No site",
    siteCode: a.task.site?.code ?? "",
    crewName: a.task.crew?.name ?? null,
    startDate: a.task.startDate.toISOString(),
    dueDate: a.task.dueDate.toISOString(),
    estimatedHours: a.task.estimatedHours,
    blockerNote: a.task.blockerNote,
  }));

  const open = await prisma.attendance.findFirst({
    where: { userId: meId, checkOutAt: null },
    include: { site: { select: { name: true } } },
    orderBy: { checkInAt: "desc" },
  });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todays = await prisma.attendance.findMany({
    where: { userId: meId, checkInAt: { gte: todayStart } },
    include: { site: { select: { name: true } } },
    orderBy: { checkInAt: "asc" },
  });

  const deployments = await prisma.deployment.findMany({
    where: { userId: meId },
    include: { site: { select: { name: true } }, task: { select: { title: true } } },
    orderBy: { startedAt: "desc" },
    take: 10,
  });

  const sites = await prisma.site.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, code: true, lat: true, lng: true, radiusM: true, address: true, city: true },
    orderBy: { name: "asc" },
  });

  return {
    props: {
      worker: { name: me.name, jobTitle: me.jobTitle },
      canSelfAssign,
      meId,
      tasks,
      openShift: open ? { siteName: open.site.name, checkInAt: open.checkInAt.toISOString() } : null,
      todays: todays.map((t) => ({
        id: t.id,
        site: t.site.name,
        checkInAt: t.checkInAt.toISOString(),
        checkOutAt: t.checkOutAt ? t.checkOutAt.toISOString() : null,
        workedMinutes: t.workedMinutes,
        status: t.status,
      })),
      deployments: deployments.map((d) => ({
        id: d.id,
        site: d.site.name,
        task: d.task?.title ?? null,
        startedAt: d.startedAt.toISOString(),
        endedAt: d.endedAt ? d.endedAt.toISOString() : null,
      })),
      sites,
    },
  };
}

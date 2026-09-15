import { GetServerSidePropsContext } from "next";
import { getSession } from "next-auth/react";
import dynamic from "next/dynamic";
import { prisma } from "@/lib/prisma";
import { homeFor } from "@/lib/rbac";
import Shell from "@/components/Shell";
import { StatCard, Progress, Badge, fmtDate } from "@/components/ui";
import { ChartCard, TasksByStatusChart, WorkloadChart, AttendanceTrendChart } from "@/components/charts";
import { getWorkforceBoard, TASK_STATUS_LABEL } from "@/lib/workforce";
import { computeTotals } from "@/lib/invoicing";
import type { MapWorker, MapSite } from "@/components/WorkforceMap";
import { TaskStatus, Prisma } from "@prisma/client";

// Leaflet touches `window` — client-side only (no SSR)
const WorkforceMap = dynamic(() => import("@/components/WorkforceMap"), {
  ssr: false,
  loading: () => <div className="card p-10 text-center text-sm text-slate-400">Loading map…</div>,
});

export default function Dashboard({
  stats,
  statusData,
  workload,
  attendanceTrend,
  sites,
  upcoming,
  activity,
  receivables,
  mapWorkers,
  mapSites,
}: {
  stats: { workers: number; busy: number; free: number; activeSites: number; openTasks: number; overdueTasks: number; completedThisMonth: number };
  statusData: { name: string; value: number }[];
  workload: { name: string; tasks: number }[];
  attendanceTrend: { day: string; present: number }[];
  sites: { id: string; name: string; code: string; status: string; progress: number; members: number; tasks: number; done: number }[];
  upcoming: { id: string; title: string; site: string; dueDate: string; priority: string; assignees: number }[];
  activity: { id: string; action: string; detail: string | null; user: string | null; createdAt: string }[];
  receivables: { total: number; outstanding: number; overdue: number };
  mapWorkers: MapWorker[];
  mapSites: MapSite[];
}) {
  return (
    <Shell title="Live Workforce Dashboard" subtitle="Real-time status across every active site">
      <WorkforceMap workers={mapWorkers} sites={mapSites} />

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Workforce" value={stats.workers} sub={`${stats.busy} busy · ${stats.free} free`} accent="brand" />
        <StatCard label="Active Sites" value={stats.activeSites} sub={`${sites.length} total sites`} accent="blue" />
        <StatCard label="Open Tasks" value={stats.openTasks} sub={`${stats.overdueTasks} overdue`} accent={stats.overdueTasks > 0 ? "red" : "emerald"} />
        <StatCard label="Receivables" value={`$${(receivables.outstanding / 1000).toFixed(1)}k`} sub={`$${(receivables.overdue / 1000).toFixed(1)}k overdue · $${(receivables.total / 1000).toFixed(1)}k billed`} accent="slate" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard title="Tasks by Status">
          <TasksByStatusChart data={statusData} />
        </ChartCard>
        <ChartCard title="Workload — Open Tasks per Worker">
          <WorkloadChart data={workload} />
        </ChartCard>
        <ChartCard title="Attendance — Last 14 Days">
          <AttendanceTrendChart data={attendanceTrend} />
        </ChartCard>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Site progress */}
        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">Site Progress</h3>
            <a href="/portal/sites" className="text-xs font-semibold text-brand-600 hover:underline">View all →</a>
          </div>
          <div className="space-y-4">
            {sites.map((s) => (
              <div key={s.id}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-800">
                    {s.name} <span className="ml-1 text-xs text-slate-400">{s.code}</span>
                  </span>
                  <span className="text-xs text-slate-500">{s.done}/{s.tasks} tasks · {s.members} workers</span>
                </div>
                <Progress value={s.progress} />
              </div>
            ))}
            {sites.length === 0 && <p className="text-sm text-slate-400">No sites yet.</p>}
          </div>
        </div>

        {/* Upcoming deadlines */}
        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">Upcoming Deadlines</h3>
            <a href="/portal/tasks" className="text-xs font-semibold text-brand-600 hover:underline">View all →</a>
          </div>
          <ul className="divide-y divide-slate-100">
            {upcoming.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">{t.title}</p>
                  <p className="text-xs text-slate-500">{t.site} · due {fmtDate(t.dueDate)} · {t.assignees} assigned</p>
                </div>
                <Badge className={
                  t.priority === "URGENT" ? "bg-red-100 text-red-700" :
                  t.priority === "HIGH" ? "bg-orange-100 text-orange-700" :
                  "bg-slate-100 text-slate-600"
                }>{t.priority}</Badge>
              </li>
            ))}
            {upcoming.length === 0 && <p className="py-4 text-sm text-slate-400">Nothing due soon.</p>}
          </ul>
        </div>
      </div>

      {/* Activity feed */}
      <div className="card mt-6 p-4">
        <h3 className="mb-3 text-sm font-bold text-slate-800">Recent Activity</h3>
        <ul className="divide-y divide-slate-100">
          {activity.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2.5 text-sm">
              <span className="badge bg-slate-100 text-slate-600">{a.action.replace(/_/g, " ")}</span>
              <span className="min-w-0 flex-1 truncate text-slate-700">{a.detail}</span>
              <span className="whitespace-nowrap text-xs text-slate-400">{a.user ?? "System"} · {fmtDate(a.createdAt)}</span>
            </li>
          ))}
          {activity.length === 0 && <p className="py-4 text-sm text-slate-400">No activity yet.</p>}
        </ul>
      </div>
    </Shell>
  );
}

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
  const session = await getSession(ctx);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  if (session.user.role === "EMPLOYEE") return { redirect: { destination: homeFor("EMPLOYEE"), permanent: false } };

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [workers, board, taskGroups, sitesRaw, tasksSoon, activity, invoices] = await Promise.all([
    prisma.user.count({ where: { role: "EMPLOYEE", status: "ACTIVE" } }),
    getWorkforceBoard(),
    prisma.task.groupBy({ by: ["status"], _count: true }),
    prisma.site.findMany({
      include: { members: true, tasks: { select: { status: true, progress: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.task.findMany({
      where: { status: { not: TaskStatus.COMPLETED } },
      include: { site: { select: { name: true } }, assignments: { select: { userId: true } } },
      orderBy: { dueDate: "asc" },
      take: 6,
    }),
    prisma.activityLog.findMany({
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.invoice.findMany({ include: { items: true, payments: true }, where: { status: { not: "CANCELLED" } } }),
  ]);

  const now = new Date();
  const statusMap = Object.fromEntries(taskGroups.map((g) => [g.status, g._count]));
  const statusData = [
    { name: "Not Started", value: statusMap["NOT_STARTED"] ?? 0 },
    { name: "In Progress", value: statusMap["IN_PROGRESS"] ?? 0 },
    { name: "Blocked", value: statusMap["BLOCKED"] ?? 0 },
    { name: "Completed", value: statusMap["COMPLETED"] ?? 0 },
  ];

  const workloadMap = new Map<string, number>();
  for (const card of board.cards) {
    if (card.status === "ACTIVE") workloadMap.set(card.name, card.openTasks);
  }
  const workload = [...workloadMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, tasks]) => ({ name, tasks }));

  const since = new Date();
  since.setDate(since.getDate() - 13);
  since.setHours(0, 0, 0, 0);
  const att = await prisma.attendance.groupBy({
    by: ["checkInAt"],
    where: { checkInAt: { gte: since } },
    _count: true,
  });
  // group by day in JS
  const perDay = new Map<string, number>();
  const attRows = await prisma.attendance.findMany({ where: { checkInAt: { gte: since } }, select: { checkInAt: true } });
  for (const r of attRows) {
    const key = r.checkInAt.toISOString().slice(0, 10);
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }
  void att;
  const attendanceTrend: { day: string; present: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    attendanceTrend.push({ day: d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" }), present: perDay.get(key) ?? 0 });
  }

  const sites = sitesRaw.map((s) => {
    const done = s.tasks.filter((t) => t.status === "COMPLETED").length;
    const progress = s.tasks.length ? Math.round(s.tasks.reduce((a, t) => a + t.progress, 0) / s.tasks.length) : 0;
    return { id: s.id, name: s.name, code: s.code, status: s.status, progress, members: s.members.length, tasks: s.tasks.length, done };
  });

  const upcoming = tasksSoon.map((t) => ({
    id: t.id,
    title: t.title,
    site: t.site?.name ?? "No site",
    dueDate: t.dueDate.toISOString(),
    priority: t.priority,
    assignees: t.assignments.length,
  }));

  const activityOut = activity.map((a) => ({
    id: a.id, action: a.action, detail: a.detail, user: a.user?.name ?? null, createdAt: a.createdAt.toISOString(),
  }));

  let total = 0, outstanding = 0, overdue = 0;
  for (const inv of invoices) {
    const { total: t } = computeTotals(inv.items, inv.taxPercent);
    const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
    total += t;
    outstanding += t - paid;
    if (t - paid > 0.001 && inv.dueDate < now) overdue += t - paid;
  }

  const completedThisMonth = await prisma.task.count({ where: { status: TaskStatus.COMPLETED, completedAt: { gte: monthStart } } });

  const mapSites = await prisma.site.findMany({
    select: { id: true, name: true, code: true, lat: true, lng: true, radiusM: true },
    orderBy: { name: "asc" },
  });

  return {
    props: {
      stats: {
        workers,
        busy: board.busyCount,
        free: board.freeCount,
        activeSites: sites.filter((s) => s.status === "ACTIVE").length,
        openTasks: (statusMap["NOT_STARTED"] ?? 0) + (statusMap["IN_PROGRESS"] ?? 0),
        overdueTasks: await prisma.task.count({ where: { status: { not: "COMPLETED" }, dueDate: { lt: now } } }),
        completedThisMonth,
      },
      statusData,
      workload,
      attendanceTrend,
      sites,
      upcoming,
      activity: activityOut,
      receivables: { total, outstanding, overdue },
      mapWorkers: board.cards.map((c) => ({
        id: c.id,
        name: c.name,
        jobTitle: c.jobTitle,
        lat: c.lat,
        lng: c.lng,
        lastSeenAt: c.lastSeenAt,
        busy: !!c.current.siteId,
        siteName: c.current.siteName,
        siteLat: c.current.siteLat,
        siteLng: c.current.siteLng,
      })),
      mapSites,
    },
  };
}

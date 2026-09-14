import { GetServerSidePropsContext } from "next";
import { getSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import DualDatePicker from "@/components/DualDatePicker";
import { Modal, Badge, Progress, EmptyState, fmtDate } from "@/components/ui";
import { TASK_STATUS_LABEL, TASK_STATUS_COLOR, PRIORITY_COLOR } from "@/lib/workforce";
import { homeFor, isManagement } from "@/lib/rbac";

type Assignment = { userId: string; user: { id: string; name: string; jobTitle: string | null } };
type Task = {
  id: string; title: string; description: string | null; status: string; priority: string;
  startDate: string; dueDate: string; progress: number; estimatedHours: number;
  site: { id: string; name: string; code: string };
  crew: { id: string; name: string } | null;
  createdBy: { id: string; name: string };
  assignments: Assignment[];
};

type WorkerOption = { id: string; name: string; jobTitle: string | null; status: string };
type CrewOption = { id: string; name: string; members: { userId: string }[] };

const emptyForm = {
  title: "", description: "", siteId: "", priority: "MEDIUM",
  startDate: "", dueDate: "", estimatedHours: "8", crewId: "", assigneeIds: [] as string[],
  notify: true, deployNow: false,
};

export default function TasksPage({ canManage }: { canManage: boolean }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sites, setSites] = useState<{ id: string; name: string }[]>([]);
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [crews, setCrews] = useState<CrewOption[]>([]);
  const [filterSite, setFilterSite] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [q, setQ] = useState("");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/tasks");
    if (res.ok) setTasks((await res.json()).tasks);
  }

  useEffect(() => {
    load();
    fetch("/api/sites").then((r) => r.ok ? r.json() : null).then((d) => d && setSites(d.sites.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }))));
    fetch("/api/users?role=EMPLOYEE").then((r) => r.ok ? r.json() : null).then((d) => d && setWorkers(d.users));
    fetch("/api/crews").then((r) => r.ok ? r.json() : null).then((d) => d && setCrews(d.crews));
  }, []);

  function pickCrew(crewId: string) {
    const crew = crews.find((c) => c.id === crewId);
    setForm((f) => ({
      ...f,
      crewId,
      assigneeIds: crew ? Array.from(new Set([...f.assigneeIds, ...crew.members.map((m) => m.userId)])) : f.assigneeIds,
    }));
  }

  function toggleAssignee(id: string) {
    setForm((f) => ({
      ...f,
      assigneeIds: f.assigneeIds.includes(id) ? f.assigneeIds.filter((x) => x !== id) : [...f.assigneeIds, id],
    }));
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        description: form.description || null,
        siteId: form.siteId,
        priority: form.priority,
        startDate: form.startDate,
        dueDate: form.dueDate,
        estimatedHours: parseFloat(form.estimatedHours) || 0,
        crewId: form.crewId || null,
        assigneeIds: form.assigneeIds,
        notify: form.notify,
        deployNow: form.deployNow,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error || "Failed to create task");
      return;
    }
    setModal(false);
    setForm(emptyForm);
    load();
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(true);
    await fetch(`/api/tasks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    load();
  }

  async function remove(t: Task) {
    if (!confirm(`Delete task "${t.title}"?`)) return;
    await fetch(`/api/tasks/${t.id}`, { method: "DELETE" });
    load();
  }

  const filtered = tasks.filter((t) =>
    (filterSite === "ALL" || t.site.id === filterSite) &&
    (filterStatus === "ALL" || t.status === filterStatus) &&
    (q === "" || t.title.toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <Shell title="Tasks" subtitle="Assign work, track status and progress in real time">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <input className="input !w-56" placeholder="Search tasks…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input !w-40" value={filterSite} onChange={(e) => setFilterSite(e.target.value)}>
            <option value="ALL">All sites</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="input !w-40" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="ALL">All statuses</option>
            <option value="NOT_STARTED">Not Started</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </div>
        {canManage && <button className="btn-primary" onClick={() => { setForm(emptyForm); setError(""); setModal(true); }}>+ Assign Task</button>}
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No tasks found" hint="Adjust filters or assign a new task." />
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => {
            const overdue = t.status !== "COMPLETED" && new Date(t.dueDate) < new Date();
            return (
              <div key={t.id} className={`card p-4 ${overdue ? "border-l-4 !border-l-red-500" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold text-slate-900">{t.title}</p>
                      <Badge className={TASK_STATUS_COLOR[t.status]}>{TASK_STATUS_LABEL[t.status]}</Badge>
                      <Badge className={PRIORITY_COLOR[t.priority]}>{t.priority}</Badge>
                      {t.crew && <Badge className="bg-violet-100 text-violet-700">{t.crew.name}</Badge>}
                      {overdue && <Badge className="bg-red-600 text-white">OVERDUE</Badge>}
                    </div>
                    {t.description ? <p className="mt-1 text-xs text-slate-600">{t.description}</p> : null}
                    <p className="mt-1.5 text-xs text-slate-500">
                      🏗️ {t.site.name} · 🗓 {fmtDate(t.startDate)} → {fmtDate(t.dueDate)} · ⏱ {t.estimatedHours}h est · created by {t.createdBy.name}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {t.assignments.map((a) => (
                        <span key={a.userId} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                          👷 {a.user.name}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="w-full max-w-56">
                    <div className="flex items-center gap-2">
                      <div className="flex-1"><Progress value={t.progress} /></div>
                      <span className="text-xs font-bold text-slate-500">{t.progress}%</span>
                    </div>
                    {canManage && (
                      <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                        {t.status !== "IN_PROGRESS" && t.status !== "COMPLETED" && (
                          <button className="btn-outline !px-2.5 !py-1 text-[11px]" disabled={busy} onClick={() => patch(t.id, { status: "IN_PROGRESS" })}>▶ Start</button>
                        )}
                        {t.status !== "COMPLETED" && (
                          <button className="btn-primary !px-2.5 !py-1 text-[11px]" disabled={busy} onClick={() => patch(t.id, { status: "COMPLETED" })}>✔ Complete</button>
                        )}
                        <button className="btn-outline !px-2.5 !py-1 text-[11px] text-red-600" onClick={() => remove(t)}>Delete</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="Assign Task" wide>
        <form onSubmit={create} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className="label">Title</label><input className="input" required minLength={3} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div className="sm:col-span-2"><label className="label">Description / instructions</label><textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div>
            <label className="label">Site</label>
            <select className="input" required value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })}>
              <option value="">— Select site —</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Priority</label>
            <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              <option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>URGENT</option>
            </select>
          </div>
          <div><DualDatePicker label="Start date" required value={form.startDate} onChange={(v) => setForm({ ...form, startDate: v })} /></div>
          <div><DualDatePicker label="Deadline" required value={form.dueDate} onChange={(v) => setForm({ ...form, dueDate: v })} /></div>
          <div><label className="label">Estimated hours</label><input className="input" type="number" min={0} step="0.5" value={form.estimatedHours} onChange={(e) => setForm({ ...form, estimatedHours: e.target.value })} /></div>
          <div>
            <label className="label">Pre-fill from crew</label>
            <select className="input" value={form.crewId} onChange={(e) => pickCrew(e.target.value)}>
              <option value="">— None —</option>
              {crews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="label">Assign to employees ({form.assigneeIds.length} selected)</label>
            <div className="grid max-h-44 grid-cols-2 gap-1.5 overflow-y-auto rounded-lg border border-slate-200 p-2 sm:grid-cols-3">
              {workers.map((w) => (
                <label key={w.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={form.assigneeIds.includes(w.id)}
                    onChange={() => toggleAssignee(w.id)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600"
                  />
                  <span className="truncate">{w.name} <span className="text-slate-400">{w.jobTitle}</span></span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.notify} onChange={(e) => setForm({ ...form, notify: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
              🔔 Auto-notify assignees (push + email; SMS when urgent)
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.deployNow} onChange={(e) => setForm({ ...form, deployNow: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
              📍 Mark workers as deployed to this site now
            </label>
          </div>

          {error && <p className="sm:col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" className="btn-outline" onClick={() => setModal(false)}>Cancel</button>
            <button className="btn-primary" disabled={busy || form.assigneeIds.length === 0}>
              {busy ? "Creating…" : "Assign task"}
            </button>
          </div>
        </form>
      </Modal>
    </Shell>
  );
}

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
  const session = await getSession(ctx);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  if (!isManagement(session.user as never)) return { redirect: { destination: homeFor(session.user.role), permanent: false } };
  return { props: { canManage: true } };
}

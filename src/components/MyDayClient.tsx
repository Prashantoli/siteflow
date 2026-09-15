import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import { Badge, Progress, fmtTime, fmtDateTime, minutesToHm, Modal } from "@/components/ui";
import { TASK_STATUS_LABEL, TASK_STATUS_COLOR, PRIORITY_COLOR } from "@/lib/workforce";
import { isWithinGeofence, formatDistance, haversineMeters } from "@/lib/geo";

export type MyTask = {
  id: string;
  title: string;
  description: string | null;
  status: "NOT_STARTED" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED";
  progress: number;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  siteId: string;
  siteName: string;
  siteCode: string;
  crewName: string | null;
  startDate: string;
  dueDate: string;
  estimatedHours: number;
  blockerNote: string | null;
  createdById?: string;
};

export type TaskCommentData = {
  id: string;
  body: string;
  createdAt: string;
  user: { id: string; name: string; role: string; jobTitle: string | null };
};

export default function MyDayClient({
  tasks,
  openShift,
  todays,
  sites,
  canSelfAssign = false,
  meId = "",
}: {
  tasks: MyTask[];
  openShift: null | { siteName: string; checkInAt: string };
  todays: { id: string; site: string; checkInAt: string; checkOutAt: string | null; workedMinutes: number; status: string }[];
  sites: { id: string; name: string; code: string; lat: number; lng: number; radiusM: number; address: string; city: string }[];
  canSelfAssign?: boolean;
  meId?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [blockFor, setBlockFor] = useState<string | null>(null); // task id being blocked
  const [blockReason, setBlockReason] = useState("");
  const [openThread, setOpenThread] = useState<string | null>(null); // task id with open comments
  const [comments, setComments] = useState<Record<string, TaskCommentData[]>>({});
  const [commentDraft, setCommentDraft] = useState("");
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueForm, setIssueForm] = useState({ title: "", description: "", category: "OTHER", priority: "MEDIUM", siteId: "", taskId: "" });
  const [issueBusy, setIssueBusy] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: "", description: "", dueDate: "", priority: "MEDIUM" });
  const [taskBusy, setTaskBusy] = useState(false);

  async function createSelfTask(e: React.FormEvent) {
    e.preventDefault();
    setTaskBusy(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: taskForm.title,
          description: taskForm.description || null,
          siteId: null, // self-assigned admin/manager tasks don't need a site
          priority: taskForm.priority,
          startDate: new Date().toISOString().slice(0, 10),
          dueDate: taskForm.dueDate,
          estimatedHours: 0,
          assigneeIds: [meId],
          notify: false,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setTaskForm({ title: "", description: "", dueDate: "", priority: "MEDIUM" });
      setMsg({ kind: "ok", text: "Task added to My Day ✔" });
      refresh();
    } catch (err) {
      setMsg({ kind: "err", text: (err as Error).message });
    }
    setTaskBusy(false);
  }

  const activeSite = useMemo(() => {
    if (!openShift) return null;
    const today = todays[todays.length - 1];
    return sites.find((s) => s.name === openShift.siteName) ?? null;
  }, [openShift, todays, sites]);

  function getPosition(): Promise<{ lat: number; lng: number }> {
    return new Promise((resolve, reject) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        reject(new Error("Geolocation is not available on this device"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        (err) => reject(new Error(err.code === err.PERMISSION_DENIED ? "Location permission denied — allow location access to check in" : "Could not get your location")),
        { enableHighAccuracy: true, timeout: 12000 }
      );
    });
  }

  async function refresh() {
    router.replace(router.asPath);
  }

  async function doCheckOut() {
    setBusy(true);
    setMsg(null);
    try {
      const p = await getPosition();
      const res = await fetch("/api/attendance/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...p }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.details?.withinGeofence === false) {
          const site = activeSite;
          const dist = site ? haversineMeters(p.lat, p.lng, site.lat, site.lng) : null;
          if (!confirm(`You appear to be ${dist !== null ? formatDistance(dist) : "far"} from ${openShift?.siteName}. Check out anyway?`)) {
            setBusy(false);
            return;
          }
          const res2 = await fetch("/api/attendance/checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...p, force: true }),
          });
          if (!res2.ok) throw new Error((await res2.json()).error);
        } else {
          throw new Error(data.error);
        }
      }
      setMsg({ kind: "ok", text: "Checked out — have a good rest!" });
      refresh();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    }
    setBusy(false);
  }

  async function doCheckIn(siteId: string) {
    setBusy(true);
    setMsg(null);
    try {
      const p = await getPosition();
      setPos(p);
      const res = await fetch("/api/attendance/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, ...p }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.details?.withinGeofence === false) {
          const site = sites.find((s) => s.id === siteId);
          const dist = site ? haversineMeters(p.lat, p.lng, site.lat, site.lng) : null;
          if (!confirm(`You are ${dist !== null ? formatDistance(dist) : "too far"} from the site geofence. Check in anyway (flagged)?`)) {
            setBusy(false);
            return;
          }
          const res2 = await fetch("/api/attendance/checkin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ siteId, ...p, force: true }),
          });
          if (!res2.ok) throw new Error((await res2.json()).error);
        } else {
          throw new Error(data.error);
        }
      }
      setMsg({ kind: "ok", text: "Checked in — shift started ✔" });
      refresh();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    }
    setBusy(false);
  }

  async function updateTask(id: string, patch: { status?: string; progress?: number; blockerNote?: string | null }) {
    setBusy(true);
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setMsg({ kind: "ok", text: "Task updated ✔ — managers have been notified" });
      setBlockFor(null);
      setBlockReason("");
      refresh();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    }
    setBusy(false);
  }

  async function loadComments(taskId: string) {
    const res = await fetch(`/api/task-comments?taskId=${taskId}`);
    if (res.ok) {
      const d = await res.json();
      setComments((c) => ({ ...c, [taskId]: d.comments }));
    }
  }

  async function toggleThread(taskId: string) {
    if (openThread === taskId) {
      setOpenThread(null);
      return;
    }
    setOpenThread(taskId);
    setCommentDraft("");
    await loadComments(taskId);
  }

  async function postComment(taskId: string) {
    if (!commentDraft.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/task-comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, body: commentDraft.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setCommentDraft("");
      await loadComments(taskId);
      setMsg({ kind: "ok", text: "Comment posted — managers notified ✔" });
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    }
    setBusy(false);
  }

  async function submitIssue(e: React.FormEvent) {
    e.preventDefault();
    setIssueBusy(true);
    try {
      const res = await fetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: issueForm.title,
          description: issueForm.description || null,
          category: issueForm.category,
          priority: issueForm.priority,
          siteId: issueForm.siteId || null,
          taskId: issueForm.taskId || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setIssueOpen(false);
      setIssueForm({ title: "", description: "", category: "OTHER", priority: "MEDIUM", siteId: "", taskId: "" });
      setMsg({ kind: "ok", text: "Issue reported — managers notified ✔" });
    } catch (err) {
      setMsg({ kind: "err", text: (err as Error).message });
    }
    setIssueBusy(false);
  }

  const openTasks = tasks.filter((t) => t.status !== "COMPLETED");
  const doneTasks = tasks.filter((t) => t.status === "COMPLETED");
  const totalWorked = todays.reduce((s, t) => s + t.workedMinutes, 0);

  return (
    <div>
      {msg && (
        <div className={`mb-4 rounded-lg px-4 py-2.5 text-sm font-medium ${msg.kind === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {msg.text}
        </div>
      )}

      {/* Check-in / out */}
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Attendance</h3>
            {openShift ? (
              <p className="mt-1 text-sm text-slate-600">
                🟢 On shift at <strong>{openShift.siteName}</strong> since {fmtTime(openShift.checkInAt)}
                {totalWorked > 0 ? ` · ${minutesToHm(totalWorked)} today` : ""}
              </p>
            ) : (
              <p className="mt-1 text-sm text-slate-500">You are not checked in. Select your site to start the shift.</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {pos && <span className="text-xs text-slate-400">📍 {pos.lat.toFixed(4)}, {pos.lng.toFixed(4)}</span>}
            {openShift ? (
              <button className="btn-danger" disabled={busy} onClick={doCheckOut}>Check out</button>
            ) : (
              <div className="flex flex-wrap gap-2">
                {sites.map((s) => (
                  <button key={s.id} className="btn-primary !px-3 !py-1.5 text-xs" disabled={busy} onClick={() => doCheckIn(s.id)}>
                    Check in · {s.code}
                  </button>
                ))}
                {sites.length === 0 && <span className="text-xs text-slate-400">No active sites</span>}
              </div>
            )}
          </div>
        </div>

        {todays.length > 0 && (
          <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
            {todays.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-slate-700">{t.site}</span>
                <span className="text-slate-500">
                  {fmtTime(t.checkInAt)} – {t.checkOutAt ? fmtTime(t.checkOutAt) : "…"} · {minutesToHm(t.workedMinutes)}
                  {t.status === "LATE" && <Badge className="ml-2 bg-orange-100 text-orange-700">LATE</Badge>}
                  {t.status === "HALF_DAY" && <Badge className="ml-2 bg-slate-100 text-slate-600">HALF DAY</Badge>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Manager/admin: quick self-assigned task (contact vendor, create users, etc.) */}
      {canSelfAssign && (
        <div className="card mt-6 p-4">
          <h3 className="text-sm font-bold text-slate-800">➕ Add a task for myself</h3>
          <p className="mb-3 mt-0.5 text-xs text-slate-500">Admin work like “Contact the vendor”, “Create new user accounts”, “Prepare site paperwork” — shows up in your My Day list below.</p>
          <form onSubmit={createSelfTask} className="grid grid-cols-1 gap-2 sm:grid-cols-12">
            <input className="input sm:col-span-4" required minLength={3} maxLength={140} placeholder="What needs doing? e.g. Contact cement vendor" value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} />
            <input className="input sm:col-span-4" placeholder="Details (optional)" value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} />
            <input className="input sm:col-span-2" type="date" required value={taskForm.dueDate} onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })} />
            <select className="input sm:col-span-1" value={taskForm.priority} onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}>
              <option value="LOW">Low</option><option value="MEDIUM">Med</option><option value="HIGH">High</option><option value="URGENT">Urgent</option>
            </select>
            <button className="btn-primary sm:col-span-1" disabled={taskBusy}>{taskBusy ? "…" : "Add"}</button>
          </form>
        </div>
      )}

      {/* My tasks */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">My Open Tasks ({openTasks.length})</h3>
            <button className="btn-outline !px-3 !py-1 text-xs" onClick={() => setIssueOpen(true)}>⚠️ Report Issue</button>
          </div>
          <div className="space-y-3">
            {openTasks.map((t) => (
              <div key={t.id} className={`rounded-lg border p-3 ${t.status === "BLOCKED" ? "border-red-300 bg-red-50/40" : "border-slate-200"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{t.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">📍 {t.siteName} · 🗓 due {new Date(t.dueDate).toLocaleDateString()}</p>
                  </div>
                  <Badge className={TASK_STATUS_COLOR[t.status]}>{TASK_STATUS_LABEL[t.status]}</Badge>
                </div>
                {t.description ? <p className="mt-1.5 text-xs text-slate-600">{t.description}</p> : null}
                {t.status === "BLOCKED" && t.blockerNote && (
                  <p className="mt-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-700">🚫 Blocked: {t.blockerNote}</p>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1"><Progress value={t.progress} /></div>
                  <span className="text-xs font-semibold text-slate-500">{t.progress}%</span>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {t.status === "NOT_STARTED" && (
                    <button className="btn-outline !px-3 !py-1 text-xs" disabled={busy} onClick={() => updateTask(t.id, { status: "IN_PROGRESS" })}>
                      ▶ Start
                    </button>
                  )}
                  {(t.status === "IN_PROGRESS" || t.status === "BLOCKED") && (
                    <>
                      {[25, 50, 75, 100].filter((p) => p > t.progress).map((p) => (
                        <button key={p} className="btn-outline !px-3 !py-1 text-xs" disabled={busy} onClick={() => updateTask(t.id, { progress: p, status: p === 100 ? "COMPLETED" : "IN_PROGRESS" })}>
                          {p === 100 ? "✔ Complete" : `${p}%`}
                        </button>
                      ))}
                    </>
                  )}
                  {t.status !== "BLOCKED" && t.status !== "COMPLETED" && (
                    <button className="btn-outline !px-3 !py-1 text-xs text-red-600" disabled={busy} onClick={() => { setBlockFor(blockFor === t.id ? null : t.id); setBlockReason(""); }}>
                      🚫 Block
                    </button>
                  )}
                  <button className="btn-outline !px-3 !py-1 text-xs" onClick={() => toggleThread(t.id)}>
                    💬 {(comments[t.id]?.length ?? 0) > 0 ? `Comments (${comments[t.id].length})` : "Comment"}
                  </button>
                </div>
                {blockFor === t.id && (
                  <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2.5">
                    <label className="label !mb-1">What is blocking this task? (managers are notified)</label>
                    <input
                      className="input"
                      autoFocus
                      placeholder="e.g. Waiting for cement delivery / equipment breakdown"
                      value={blockReason}
                      onChange={(e) => setBlockReason(e.target.value)}
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <button className="btn-outline !px-3 !py-1 text-xs" onClick={() => { setBlockFor(null); setBlockReason(""); }}>Cancel</button>
                      <button className="btn-danger !px-3 !py-1 text-xs" disabled={busy} onClick={() => updateTask(t.id, { status: "BLOCKED", blockerNote: blockReason.trim() || null })}>
                        Mark blocked
                      </button>
                    </div>
                  </div>
                )}
                {openThread === t.id && (
                  <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                    <div className="max-h-48 space-y-2 overflow-y-auto">
                      {(comments[t.id] ?? []).map((c) => (
                        <div key={c.id} className="rounded-lg bg-white px-2.5 py-1.5 text-xs shadow-sm">
                          <p className="font-semibold text-slate-700">
                            {c.user.name}
                            {c.user.role !== "EMPLOYEE" && <span className="ml-1 rounded bg-brand-100 px-1 text-[10px] font-bold text-brand-700">MANAGER</span>}
                            <span className="ml-1 font-normal text-slate-400">{fmtDateTime(c.createdAt)}</span>
                          </p>
                          <p className="mt-0.5 whitespace-pre-wrap text-slate-600">{c.body}</p>
                        </div>
                      ))}
                      {(comments[t.id] ?? []).length === 0 && <p className="py-2 text-center text-xs text-slate-400">No comments yet — start the conversation.</p>}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <input
                        className="input"
                        placeholder="Write a comment for the site manager…"
                        value={commentDraft}
                        onChange={(e) => setCommentDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); postComment(t.id); } }}
                      />
                      <button className="btn-primary !px-3 !py-1 text-xs" disabled={busy || !commentDraft.trim()} onClick={() => postComment(t.id)}>Send</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {openTasks.length === 0 && <p className="py-4 text-sm text-slate-400">No open tasks — great job! 🎉</p>}
          </div>
        </div>

        <div className="card p-4">
          <h3 className="mb-3 text-sm font-bold text-slate-800">Completed ({doneTasks.length})</h3>
          <ul className="divide-y divide-slate-100">
            {doneTasks.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-700">{t.title}</p>
                  <p className="text-xs text-slate-400">{t.siteName} · {new Date(t.dueDate).toLocaleDateString()}</p>
                </div>
                <Badge className={TASK_STATUS_COLOR.COMPLETED}>DONE</Badge>
              </li>
            ))}
            {doneTasks.length === 0 && <p className="py-4 text-sm text-slate-400">Nothing completed yet.</p>}
          </ul>
        </div>
      </div>

      {/* Report Issue modal */}
      <Modal open={issueOpen} onClose={() => setIssueOpen(false)} title="⚠️ Report an Issue">
        <form onSubmit={submitIssue} className="space-y-3">
          <div>
            <label className="label">Issue title</label>
            <input className="input" required minLength={3} maxLength={140} placeholder="e.g. Scaffold on 3rd floor is unsafe" value={issueForm.title} onChange={(e) => setIssueForm({ ...issueForm, title: e.target.value })} />
          </div>
          <div>
            <label className="label">Details (optional)</label>
            <textarea className="input" rows={3} maxLength={2000} placeholder="Describe the problem, where exactly it is, and anything you already tried." value={issueForm.description} onChange={(e) => setIssueForm({ ...issueForm, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Category</label>
              <select className="input" value={issueForm.category} onChange={(e) => setIssueForm({ ...issueForm, category: e.target.value })}>
                <option value="SAFETY">Safety</option>
                <option value="EQUIPMENT">Equipment</option>
                <option value="MATERIAL">Material shortage</option>
                <option value="SITE">Site condition</option>
                <option value="PAYROLL">Payroll</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label className="label">Priority</label>
              <select className="input" value={issueForm.priority} onChange={(e) => setIssueForm({ ...issueForm, priority: e.target.value })}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
            <div>
              <label className="label">Site (optional)</label>
              <select className="input" value={issueForm.siteId} onChange={(e) => setIssueForm({ ...issueForm, siteId: e.target.value })}>
                <option value="">— None —</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Related task (optional)</label>
              <select className="input" value={issueForm.taskId} onChange={(e) => setIssueForm({ ...issueForm, taskId: e.target.value })}>
                <option value="">— None —</option>
                {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-outline" onClick={() => setIssueOpen(false)}>Cancel</button>
            <button className="btn-primary" disabled={issueBusy}>{issueBusy ? "Sending…" : "Send to managers"}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

import { GetServerSidePropsContext } from "next";
import { getSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { Badge, EmptyState, fmtDateTime, Modal } from "@/components/ui";
import { homeFor, isManagement } from "@/lib/rbac";
import { mapsLink } from "@/lib/geo";

type WorkerCard = {
  id: string; name: string; jobTitle: string | null; status: string; hourlyRate: number;
  lastSeenAt: string | null;
  current: { siteId: string | null; siteName: string | null; taskId: string | null; taskTitle: string | null; taskStatus: string | null; since: string | null };
  openTasks: number;
};

type Site = { id: string; name: string; code: string };
type Worker = { id: string; name: string; jobTitle: string | null };

export default function WorkforcePage() {
  const [cards, setCards] = useState<WorkerCard[]>([]);
  const [counts, setCounts] = useState({ busy: 0, free: 0, offline: 0 });
  const [sites, setSites] = useState<Site[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [filter, setFilter] = useState<"ALL" | "FREE" | "BUSY" | "OFFLINE">("ALL");
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(false);
  const [deployForm, setDeployForm] = useState({ userId: "", siteId: "", note: "" });

  async function load() {
    const res = await fetch("/api/workforce");
    if (res.ok) {
      const d = await res.json();
      setCards(d.cards);
      setCounts({ busy: d.busyCount, free: d.freeCount, offline: d.offline });
    }
  }

  useEffect(() => {
    load();
    fetch("/api/sites").then((r) => r.ok ? r.json() : null).then((d) => d && setSites(d.sites.map((s: Site) => ({ id: s.id, name: s.name, code: s.code }))));
    fetch("/api/users?role=EMPLOYEE").then((r) => r.ok ? r.json() : null).then((d) => d && setWorkers(d.users));
    const t = setInterval(load, 30_000); // live refresh
    return () => clearInterval(t);
  }, []);

  async function deploy(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await fetch("/api/workforce/deploy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: deployForm.userId, siteId: deployForm.siteId, note: deployForm.note || null }),
    });
    setBusy(false);
    setModal(false);
    setDeployForm({ userId: "", siteId: "", note: "" });
    load();
  }

  async function recall(userId: string) {
    if (!confirm("End this worker's current deployment?")) return;
    setBusy(true);
    await fetch("/api/workforce/deploy", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    setBusy(false);
    load();
  }

  const filtered = cards.filter((c) =>
    filter === "ALL" ? true :
    filter === "FREE" ? c.status === "ACTIVE" && !c.current.siteId :
    filter === "BUSY" ? c.status === "ACTIVE" && !!c.current.siteId :
    c.status !== "ACTIVE"
  );

  const statusBadge = (c: WorkerCard) =>
    c.status !== "ACTIVE" ? <Badge className="bg-slate-100 text-slate-500">{c.status.replace("_", " ")}</Badge> :
    c.current.siteId ? <Badge className="bg-blue-100 text-blue-700">BUSY</Badge> :
    <Badge className="bg-emerald-100 text-emerald-700">FREE</Badge>;

  return (
    <Shell title="Workforce" subtitle="Live deployment status — free vs busy, site-wise distribution">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {(["ALL", "FREE", "BUSY", "OFFLINE"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold ${filter === f ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}
            >
              {f}{f === "FREE" ? ` (${counts.free})` : f === "BUSY" ? ` (${counts.busy})` : f === "OFFLINE" ? ` (${counts.offline})` : ` (${cards.length})`}
            </button>
          ))}
        </div>
        <button className="btn-primary" onClick={() => setModal(true)}>📍 Deploy Worker</button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No workers match this filter" />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => (
            <div key={c.id} className="card p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-sm font-extrabold text-brand-700">
                    {c.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{c.name}</p>
                    <p className="text-xs text-slate-400">{c.jobTitle ?? "Worker"} · ${c.hourlyRate}/h</p>
                  </div>
                </div>
                {statusBadge(c)}
              </div>

              <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
                {c.current.siteId ? (
                  <>
                    <p className="font-semibold text-slate-800">🏗️ {c.current.siteName}</p>
                    <p className="mt-0.5 text-xs text-slate-500">📋 {c.current.taskTitle ?? "No active task"}{c.current.since ? ` · since ${fmtDateTime(c.current.since)}` : ""}</p>
                  </>
                ) : (
                  <p className="text-slate-500">Not deployed to any site right now</p>
                )}
                {c.lastSeenAt && (
                  <p className="mt-1 text-[11px] text-slate-400">📡 Last location ping: {fmtDateTime(c.lastSeenAt)}</p>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="text-xs text-slate-500">{c.openTasks} open task{c.openTasks === 1 ? "" : "s"}</span>
                {c.current.siteId ? (
                  <button className="btn-outline !px-3 !py-1 text-xs text-red-600" disabled={busy} onClick={() => recall(c.id)}>Recall</button>
                ) : (
                  <button className="btn-primary !px-3 !py-1 text-xs" disabled={c.status !== "ACTIVE"} onClick={() => { setDeployForm((f) => ({ ...f, userId: c.id })); setModal(true); }}>Deploy</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="Deploy Worker to Site">
        <form onSubmit={deploy} className="space-y-3">
          <div>
            <label className="label">Worker</label>
            <select className="input" required value={deployForm.userId} onChange={(e) => setDeployForm({ ...deployForm, userId: e.target.value })}>
              <option value="">— Select worker —</option>
              {workers.map((w) => <option key={w.id} value={w.id}>{w.name} {w.jobTitle ? `(${w.jobTitle})` : ""}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Site</label>
            <select className="input" required value={deployForm.siteId} onChange={(e) => setDeployForm({ ...deployForm, siteId: e.target.value })}>
              <option value="">— Select site —</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
            </select>
          </div>
          <div>
            <label className="label">Note (optional)</label>
            <input className="input" value={deployForm.note} onChange={(e) => setDeployForm({ ...deployForm, note: e.target.value })} placeholder="e.g. Night shift rotation" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-outline" onClick={() => setModal(false)}>Cancel</button>
            <button className="btn-primary" disabled={busy}>{busy ? "Deploying…" : "Deploy"}</button>
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
  return { props: {} };
}

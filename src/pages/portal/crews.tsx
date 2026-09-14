import { GetServerSidePropsContext } from "next";
import { getSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { Modal, Badge, EmptyState } from "@/components/ui";
import { homeFor, isManagement } from "@/lib/rbac";

type Crew = {
  id: string; name: string; skill: string | null;
  leader: { id: string; name: string } | null;
  members: { userId: string; user: { id: string; name: string; jobTitle: string | null } }[];
  _count: { tasks: number };
};
type Worker = { id: string; name: string; jobTitle: string | null; status: string };

export default function CrewsPage() {
  const [crews, setCrews] = useState<Crew[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Crew | null>(null);
  const [form, setForm] = useState({ name: "", skill: "", leaderId: "", memberIds: [] as string[] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/crews");
    if (res.ok) setCrews((await res.json()).crews);
  }

  useEffect(() => {
    load();
    fetch("/api/users?role=EMPLOYEE").then((r) => r.ok ? r.json() : null).then((d) => d && setWorkers(d.users));
  }, []);

  function openCreate() {
    setEditing(null);
    setForm({ name: "", skill: "", leaderId: "", memberIds: [] });
    setError("");
    setModal(true);
  }

  function openEdit(c: Crew) {
    setEditing(c);
    setForm({
      name: c.name, skill: c.skill ?? "", leaderId: c.leader?.id ?? "",
      memberIds: c.members.map((m) => m.userId),
    });
    setError("");
    setModal(true);
  }

  function toggleMember(id: string) {
    setForm((f) => ({
      ...f,
      memberIds: f.memberIds.includes(id) ? f.memberIds.filter((x) => x !== id) : [...f.memberIds, id],
      leaderId: f.leaderId === id && !f.memberIds.includes(id) ? f.leaderId : f.leaderId,
    }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const payload = {
      name: form.name,
      skill: form.skill || null,
      leaderId: form.leaderId || null,
      memberIds: form.memberIds,
    };
    const res = await fetch(editing ? `/api/crews/${editing.id}` : "/api/crews", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error || "Failed to save crew");
      return;
    }
    setModal(false);
    load();
  }

  async function remove(c: Crew) {
    if (!confirm(`Delete crew "${c.name}"?`)) return;
    await fetch(`/api/crews/${c.id}`, { method: "DELETE" });
    load();
  }

  return (
    <Shell title="Crews" subtitle="Organize workers into skilled crews for faster assignment">
      <div className="mb-4 flex justify-end">
        <button className="btn-primary" onClick={openCreate}>+ New Crew</button>
      </div>

      {crews.length === 0 ? (
        <EmptyState title="No crews yet" hint="Create a crew to assign whole teams at once." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {crews.map((c) => (
            <div key={c.id} className="card p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-900">{c.name}</p>
                  {c.skill && <Badge className="mt-1 bg-violet-100 text-violet-700">{c.skill}</Badge>}
                </div>
                <span className="text-xs text-slate-400">{c._count.tasks} tasks</span>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                ⭐ Leader: <strong>{c.leader?.name ?? "—"}</strong>
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {c.members.map((m) => (
                  <span key={m.userId} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">👷 {m.user.name}</span>
                ))}
                {c.members.length === 0 && <span className="text-xs text-slate-400">No members</span>}
              </div>
              <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
                <button className="btn-outline flex-1 !py-1.5 text-xs" onClick={() => openEdit(c)}>Edit</button>
                <button className="btn-outline !py-1.5 text-xs text-red-600" onClick={() => remove(c)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? `Edit ${editing.name}` : "New Crew"}>
        <form onSubmit={save} className="space-y-3">
          <div><label className="label">Crew name</label><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="label">Skill / specialty</label><input className="input" placeholder="e.g. Masonry, Electrical" value={form.skill} onChange={(e) => setForm({ ...form, skill: e.target.value })} /></div>
          <div>
            <label className="label">Leader</label>
            <select className="input" value={form.leaderId} onChange={(e) => setForm({ ...form, leaderId: e.target.value })}>
              <option value="">— None —</option>
              {workers.filter((w) => form.memberIds.includes(w.id)).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <p className="mt-1 text-[11px] text-slate-400">Add the leader as a member first.</p>
          </div>
          <div>
            <label className="label">Members ({form.memberIds.length})</label>
            <div className="grid max-h-44 grid-cols-2 gap-1.5 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {workers.map((w) => (
                <label key={w.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-slate-50">
                  <input type="checkbox" checked={form.memberIds.includes(w.id)} onChange={() => toggleMember(w.id)} className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600" />
                  <span className="truncate">{w.name} <span className="text-slate-400">{w.jobTitle}</span></span>
                </label>
              ))}
            </div>
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-outline" onClick={() => setModal(false)}>Cancel</button>
            <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save crew"}</button>
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

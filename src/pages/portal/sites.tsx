import { GetServerSidePropsContext } from "next";
import { getSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import DualDatePicker from "@/components/DualDatePicker";
import { Modal, Badge, Progress, money, fmtDate, EmptyState } from "@/components/ui";
import { homeFor, isManagement } from "@/lib/rbac";

type Site = {
  id: string; name: string; code: string; address: string; city: string;
  lat: number; lng: number; radiusM: number; status: string; budget: number;
  startDate: string | null; endDate: string | null; description: string | null;
  manager: { id: string; name: string } | null;
  _count: { members: number; tasks: number };
};

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700",
  ON_HOLD: "bg-orange-100 text-orange-700",
  COMPLETED: "bg-slate-100 text-slate-600",
};

const emptyForm = { name: "", code: "", address: "", city: "", lat: "", lng: "", radiusM: "150", budget: "0", managerId: "", startDate: "", endDate: "", description: "", status: "ACTIVE" };

export default function SitesPage({ canEdit }: { canEdit: boolean }) {
  const [sites, setSites] = useState<Site[]>([]);
  const [managers, setManagers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Site | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/sites");
    if (res.ok) {
      const data = await res.json();
      setSites(data.sites);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    fetch("/api/users?role=MANAGER").then((r) => r.ok ? r.json() : null).then((d) => d && setManagers(d.users));
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setModal(true);
  }

  function openEdit(s: Site) {
    setEditing(s);
    setForm({
      name: s.name, code: s.code, address: s.address, city: s.city,
      lat: String(s.lat), lng: String(s.lng), radiusM: String(s.radiusM),
      budget: String(s.budget), managerId: s.manager?.id ?? "",
      startDate: s.startDate ? s.startDate.slice(0, 10) : "",
      endDate: s.endDate ? s.endDate.slice(0, 10) : "",
      description: s.description ?? "", status: s.status,
    });
    setError("");
    setModal(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const payload: Record<string, unknown> = {
      name: form.name, code: form.code, address: form.address, city: form.city,
      lat: parseFloat(form.lat), lng: parseFloat(form.lng), radiusM: parseInt(form.radiusM),
      budget: parseFloat(form.budget), status: form.status,
      managerId: form.managerId || null,
      startDate: form.startDate || null, endDate: form.endDate || null,
      description: form.description || null,
    };
    const res = await fetch(editing ? `/api/sites/${editing.id}` : "/api/sites", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json();
      setError(d.error || "Failed to save");
      return;
    }
    setModal(false);
    load();
  }

  async function remove(s: Site) {
    if (!confirm(`Delete site ${s.name}? This is only possible when it has no tasks.`)) return;
    const res = await fetch(`/api/sites/${s.id}`, { method: "DELETE" });
    if (!res.ok) alert((await res.json()).error);
    load();
  }

  return (
    <Shell title="Sites" subtitle="All construction sites, locations and geofences">
      <div className="mb-4 flex justify-end">
        {canEdit && <button className="btn-primary" onClick={openCreate}>+ New Site</button>}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : sites.length === 0 ? (
        <EmptyState title="No sites yet" hint="Create your first site to start assigning work." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sites.map((s) => (
            <div key={s.id} className="card flex flex-col p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-900">{s.name}</p>
                  <p className="text-xs text-slate-400">{s.code} · {s.city}</p>
                </div>
                <Badge className={STATUS_COLOR[s.status]}>{s.status.replace("_", " ")}</Badge>
              </div>
              <p className="mt-2 text-xs text-slate-500">📍 {s.address}</p>
              <p className="text-xs text-slate-400">Geofence: {s.radiusM} m radius · {s.lat.toFixed(4)}, {s.lng.toFixed(4)}</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-slate-50 p-2">
                  <p className="text-base font-bold text-slate-800">{s._count.members}</p>
                  <p className="text-[10px] uppercase text-slate-400">Workers</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-2">
                  <p className="text-base font-bold text-slate-800">{s._count.tasks}</p>
                  <p className="text-[10px] uppercase text-slate-400">Tasks</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-2">
                  <p className="text-base font-bold text-slate-800">{money(s.budget)}</p>
                  <p className="text-[10px] uppercase text-slate-400">Budget</p>
                </div>
              </div>
              <div className="mt-3">
                <Progress value={s._count.tasks ? Math.round((s._count.members / Math.max(1, s._count.tasks)) * 100) : 0} />
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
                <span>👤 {s.manager?.name ?? "Unassigned"}</span>
                <span>{s.startDate ? `${fmtDate(s.startDate)} →` : ""} {s.endDate ? fmtDate(s.endDate) : ""}</span>
              </div>
              {canEdit && (
                <div className="mt-3 flex gap-2">
                  <button className="btn-outline flex-1 !py-1.5 text-xs" onClick={() => openEdit(s)}>Edit</button>
                  <button className="btn-outline !py-1.5 text-xs text-red-600" onClick={() => remove(s)}>Delete</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? `Edit ${editing.name}` : "New Site"} wide>
        <form onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label className="label">Site name</label><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="label">Code</label><input className="input" required placeholder="SKY-P2" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} disabled={!!editing} /></div>
          <div className="sm:col-span-2"><label className="label">Address</label><input className="input" required value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div><label className="label">City</label><input className="input" required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
          <div>
            <label className="label">Site manager</label>
            <select className="input" value={form.managerId} onChange={(e) => setForm({ ...form, managerId: e.target.value })}>
              <option value="">— Unassigned —</option>
              {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div><label className="label">Latitude</label><input className="input" required type="number" step="any" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} /></div>
          <div><label className="label">Longitude</label><input className="input" required type="number" step="any" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} /></div>
          <div><label className="label">Geofence radius (m)</label><input className="input" required type="number" min={50} max={5000} value={form.radiusM} onChange={(e) => setForm({ ...form, radiusM: e.target.value })} /></div>
          <div><label className="label">Budget (USD)</label><input className="input" type="number" min={0} value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} /></div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="ACTIVE">ACTIVE</option><option value="ON_HOLD">ON HOLD</option><option value="COMPLETED">COMPLETED</option>
            </select>
          </div>
          <div><DualDatePicker label="Start date" value={form.startDate} onChange={(v) => setForm({ ...form, startDate: v })} /></div>
          <div><DualDatePicker label="End date" value={form.endDate} onChange={(v) => setForm({ ...form, endDate: v })} /></div>
          <div className="sm:col-span-2"><label className="label">Description</label><textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          {error && <p className="sm:col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" className="btn-outline" onClick={() => setModal(false)}>Cancel</button>
            <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Create site"}</button>
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
  return { props: { canEdit: true } };
}

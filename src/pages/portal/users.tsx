import { GetServerSidePropsContext } from "next";
import { getSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { Modal, Badge, EmptyState, fmtDate } from "@/components/ui";
import { homeFor } from "@/lib/rbac";

type U = {
  id: string; name: string; email: string; phone: string | null; role: string;
  jobTitle: string | null; hourlyRate: number; status: string; createdAt: string;
};

const ROLE_COLOR: Record<string, string> = {
  ADMIN: "bg-violet-100 text-violet-700",
  MANAGER: "bg-blue-100 text-blue-700",
  EMPLOYEE: "bg-slate-100 text-slate-600",
};
const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700",
  INACTIVE: "bg-red-100 text-red-700",
  ON_LEAVE: "bg-orange-100 text-orange-700",
};

const emptyForm = { name: "", email: "", password: "", role: "EMPLOYEE", phone: "", jobTitle: "", hourlyRate: "0" };

export default function UsersPage() {
  const [users, setUsers] = useState<U[]>([]);
  const [filterRole, setFilterRole] = useState("ALL");
  const [q, setQ] = useState("");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<U | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/users");
    if (res.ok) setUsers((await res.json()).users);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setModal(true);
  }

  function openEdit(u: U) {
    setEditing(u);
    setForm({ name: u.name, email: u.email, password: "", role: u.role, phone: u.phone ?? "", jobTitle: u.jobTitle ?? "", hourlyRate: String(u.hourlyRate) });
    setError("");
    setModal(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const payload: Record<string, unknown> = editing
      ? {
          name: form.name, role: form.role, phone: form.phone || null,
          jobTitle: form.jobTitle || null, hourlyRate: parseFloat(form.hourlyRate) || 0,
          ...(form.password ? { password: form.password } : {}),
        }
      : {
          name: form.name, email: form.email, password: form.password, role: form.role,
          phone: form.phone || null, jobTitle: form.jobTitle || null,
          hourlyRate: parseFloat(form.hourlyRate) || 0,
        };
    const res = await fetch(editing ? `/api/users/${editing.id}` : "/api/users", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error || "Failed to save user");
      return;
    }
    setModal(false);
    load();
  }

  async function deactivate(u: U) {
    if (!confirm(`Deactivate ${u.name}? They will no longer be able to sign in.`)) return;
    const res = await fetch(`/api/users/${u.id}`, { method: "DELETE" });
    if (!res.ok) alert((await res.json()).error);
    load();
  }

  async function activate(u: U) {
    await fetch(`/api/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ACTIVE" }),
    });
    load();
  }

  const filtered = users.filter(
    (u) =>
      (filterRole === "ALL" || u.role === filterRole) &&
      (q === "" || u.name.toLowerCase().includes(q.toLowerCase()) || u.email.toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <Shell title="Users & Access" subtitle="Manage accounts, roles and rates (Admin only)">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <input className="input !w-56" placeholder="Search name or email…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input !w-40" value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
            <option value="ALL">All roles</option><option>ADMIN</option><option>MANAGER</option><option>EMPLOYEE</option>
          </select>
        </div>
        <button className="btn-primary" onClick={openCreate}>+ Add User</button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No users found" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Name</th><th className="th">Role</th><th className="th">Job Title</th>
                <th className="th">Rate</th><th className="th">Status</th><th className="th">Joined</th><th className="th">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="td">
                    <p className="font-semibold text-slate-900">{u.name}</p>
                    <p className="text-xs text-slate-400">{u.email}{u.phone ? ` · ${u.phone}` : ""}</p>
                  </td>
                  <td className="td"><Badge className={ROLE_COLOR[u.role]}>{u.role}</Badge></td>
                  <td className="td">{u.jobTitle ?? "—"}</td>
                  <td className="td">{u.role === "EMPLOYEE" ? `$${u.hourlyRate}/h` : "—"}</td>
                  <td className="td"><Badge className={STATUS_COLOR[u.status]}>{u.status.replace("_", " ")}</Badge></td>
                  <td className="td text-xs">{fmtDate(u.createdAt)}</td>
                  <td className="td">
                    <div className="flex gap-1.5">
                      <button className="btn-outline !px-2.5 !py-1 text-[11px]" onClick={() => openEdit(u)}>Edit</button>
                      {u.status === "INACTIVE" ? (
                        <button className="btn-outline !px-2.5 !py-1 text-[11px] text-emerald-600" onClick={() => activate(u)}>Activate</button>
                      ) : (
                        <button className="btn-outline !px-2.5 !py-1 text-[11px] text-red-600" onClick={() => deactivate(u)}>Deactivate</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? `Edit ${editing.name}` : "Add User"}>
        <form onSubmit={save} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">Full name</label><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><label className="label">Email</label><input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!!editing} /></div>
            <div>
              <label className="label">Role</label>
              <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="EMPLOYEE">Employee / Worker</option><option value="MANAGER">CMS / Site Manager</option><option value="ADMIN">Admin</option>
              </select>
            </div>
            <div><label className="label">{editing ? "New password (leave blank to keep)" : "Password"}</label><input className="input" type="password" minLength={6} required={!editing} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
            <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><label className="label">Job title</label><input className="input" placeholder="e.g. Mason" value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} /></div>
            <div><label className="label">Hourly rate (USD)</label><input className="input" type="number" min={0} step="0.5" value={form.hourlyRate} onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })} /></div>
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-outline" onClick={() => setModal(false)}>Cancel</button>
            <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Create user"}</button>
          </div>
        </form>
      </Modal>
    </Shell>
  );
}

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
  const session = await getSession(ctx);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  if (session.user.role !== "ADMIN") return { redirect: { destination: homeFor(session.user.role), permanent: false } };
  return { props: {} };
}

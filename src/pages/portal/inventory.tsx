import { GetServerSidePropsContext } from "next";
import { getSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { Modal, Badge, StatCard, EmptyState, moneySym, useBaseCurrency } from "@/components/ui";
import { homeFor, isManagement } from "@/lib/rbac";

type Item = {
  id: string; code: string; name: string; category: string | null; unit: string;
  stockQty: number; minStock: number; avgCost: number; lastPrice: number; isActive: boolean;
};

const emptyForm = { code: "", name: "", category: "", unit: "nos", stockQty: "0", minStock: "0", lastPrice: "0" };

export default function InventoryPage() {
  const base = useBaseCurrency();
  const [items, setItems] = useState<Item[]>([]);
  const [q, setQ] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (lowOnly) p.set("low", "1");
    const res = await fetch(`/api/inventory?${p.toString()}`);
    if (res.ok) setItems((await res.json()).items);
  }, [q, lowOnly]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setModal(true);
  }
  function openEdit(i: Item) {
    setEditing(i);
    setForm({ code: i.code, name: i.name, category: i.category ?? "", unit: i.unit, stockQty: String(i.stockQty), minStock: String(i.minStock), lastPrice: String(i.lastPrice) });
    setError("");
    setModal(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const payload: Record<string, unknown> = {
      name: form.name, category: form.category || null, unit: form.unit,
      stockQty: parseFloat(form.stockQty) || 0, minStock: parseFloat(form.minStock) || 0,
      lastPrice: parseFloat(form.lastPrice) || 0,
    };
    const res = await fetch(editing ? `/api/inventory/${editing.id}` : "/api/inventory", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing ? payload : { ...payload, code: form.code }),
    });
    setBusy(false);
    if (!res.ok) { setError((await res.json()).error || "Failed"); return; }
    setModal(false);
    load();
  }

  async function archive(i: Item) {
    if (!confirm(`Archive ${i.name}? History is preserved.`)) return;
    await fetch(`/api/inventory/${i.id}`, { method: "DELETE" });
    load();
  }

  const stockValue = items.reduce((s, i) => s + i.stockQty * i.avgCost, 0);
  const lowCount = items.filter((i) => i.stockQty <= i.minStock).length;

  return (
    <Shell title="Inventory" subtitle="Materials master — stock levels and editable prices (market rates fluctuate)">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Items" value={items.length} accent="blue" />
        <StatCard label={`Stock Value (at avg cost, ${base})`} value={stockValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })} accent="brand" sub="Values shown in base currency" />
        <StatCard label="Low Stock Alerts" value={lowCount} accent={lowCount > 0 ? "red" : "emerald"} />
        <StatCard label="Archived" value={items.filter((i) => !i.isActive).length} accent="slate" />
      </div>

      <div className="mb-4 mt-6 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <input className="input !w-56" placeholder="Search item / code / category…" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
            Low stock only
          </label>
        </div>
        <div className="flex gap-2">
          <a className="btn-outline" href="/api/reports/export?type=inventory" target="_blank">⬇ Export CSV</a>
          <button className="btn-primary" onClick={openCreate}>+ Add Item</button>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState title="No inventory items" hint="Add materials like Cement, Rebar, Aggregate with units and rates." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Item</th><th className="th">Category</th><th className="th">Stock</th>
                <th className="th">Min</th><th className="th">Avg Cost</th><th className="th">Last Price</th><th className="th">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((i) => (
                <tr key={i.id} className={`hover:bg-slate-50 ${i.isActive ? "" : "opacity-50"}`}>
                  <td className="td">
                    <p className="font-semibold text-slate-900">{i.name} {!i.isActive && <Badge className="ml-1 bg-slate-100 text-slate-500">ARCHIVED</Badge>}</p>
                    <p className="text-xs text-slate-400">{i.code}</p>
                  </td>
                  <td className="td">{i.category ?? "—"}</td>
                  <td className="td">
                    <span className={`font-bold ${i.stockQty <= i.minStock ? "text-red-600" : "text-slate-800"}`}>{i.stockQty}</span> <span className="text-xs text-slate-400">{i.unit}</span>
                    {i.stockQty <= i.minStock && <Badge className="ml-1 bg-red-100 text-red-700">LOW</Badge>}
                  </td>
                  <td className="td text-slate-500">{i.minStock}</td>
                  <td className="td">{moneySym(i.avgCost, base)}</td>
                  <td className="td">{moneySym(i.lastPrice, base)}</td>
                  <td className="td">
                    <div className="flex gap-1.5">
                      <button className="btn-outline !px-2.5 !py-1 text-[11px]" onClick={() => openEdit(i)}>Edit</button>
                      {i.isActive && <button className="btn-outline !px-2.5 !py-1 text-[11px] text-red-600" onClick={() => archive(i)}>Archive</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? `Edit ${editing.name}` : "Add Inventory Item"}>
        <form onSubmit={save} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">Item code</label><input className="input" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="CEM-OPC-50" disabled={!!editing} /></div>
            <div><label className="label">Item name</label><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Cement OPC 53 Grade" /></div>
            <div><label className="label">Category</label><input className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Cement" /></div>
            <div>
              <label className="label">Unit</label>
              <select className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                {["nos", "bag", "kg", "quintal", "MT", "cu.m", "sq.m", "m", "ltr", "brass", "lot"].map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div><label className="label">Current stock</label><input className="input" type="number" step="any" min={0} value={form.stockQty} onChange={(e) => setForm({ ...form, stockQty: e.target.value })} /></div>
            <div><label className="label">Min stock (reorder at)</label><input className="input" type="number" step="any" min={0} value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} /></div>
            <div className="sm:col-span-2">
              <label className="label">Last purchase price (Rs.) — editable as market prices change</label>
              <input className="input" type="number" step="any" min={0} value={form.lastPrice} onChange={(e) => setForm({ ...form, lastPrice: e.target.value })} />
            </div>
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-outline" onClick={() => setModal(false)}>Cancel</button>
            <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save item"}</button>
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

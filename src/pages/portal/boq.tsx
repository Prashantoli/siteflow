import { GetServerSidePropsContext } from "next";
import { getSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { Modal, Badge, EmptyState, money } from "@/components/ui";
import { homeFor, isManagement } from "@/lib/rbac";
import { CURRENCIES } from "@/lib/currency";

type BoqItem = { id?: string; description: string; unit: string; qty: number; rate: number; remark?: string | null };
type InvOption = { id: string; name: string; code: string; unit: string; lastPrice: number; category: string | null };

/**
 * Description input with live inventory autocomplete.
 * Typing filters inventory items (starts-with matches first, then contains);
 * picking one fills description + unit + last price (all still editable).
 */
function ItemSuggestInput({
  value,
  inventory,
  onPick,
  onChange,
  className = "",
}: {
  value: string;
  inventory: InvOption[];
  onPick: (item: InvOption) => void;
  onChange: (v: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const q = value.trim().toLowerCase();

  const matches = useMemo(() => {
    if (!q) return inventory.slice(0, 8);
    const starts = inventory.filter(
      (i) => i.name.toLowerCase().startsWith(q) || i.code.toLowerCase().startsWith(q)
    );
    const startSet = new Set(starts.map((i) => i.id));
    const contains = inventory.filter(
      (i) =>
        !startSet.has(i.id) &&
        (i.name.toLowerCase().includes(q) ||
          i.code.toLowerCase().includes(q) ||
          (i.category ?? "").toLowerCase().includes(q))
    );
    return [...starts, ...contains].slice(0, 8);
  }, [q, inventory]);

  function pick(item: InvOption) {
    onPick(item);
    setOpen(false);
    setHi(-1);
  }

  return (
    <div className={`relative ${className}`}>
      <input
        className="input"
        required
        placeholder="Type to search inventory…"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHi(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (!open || matches.length === 0) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => (h + 1) % matches.length); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => (h <= 0 ? matches.length - 1 : h - 1)); }
          else if (e.key === "Enter") { e.preventDefault(); pick(matches[hi >= 0 ? hi : 0]); }
          else if (e.key === "Escape") { setOpen(false); setHi(-1); }
        }}
      />
      {open && matches.length > 0 && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
          <div className="max-h-56 overflow-y-auto">
            {matches.map((item, i) => (
              <button
                key={item.id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(item); }}
                onMouseEnter={() => setHi(i)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${i === hi ? "bg-amber-50" : "bg-white"}`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-slate-800">{item.name}</span>
                  <span className="block text-[11px] text-slate-400">{item.code}{item.category ? ` · ${item.category}` : ""}</span>
                </span>
                <span className="shrink-0 text-right text-[11px] text-slate-500">
                  {item.unit} · last {item.lastPrice.toLocaleString("en-IN")}
                </span>
              </button>
            ))}
          </div>
          <div className="border-t border-slate-100 bg-slate-50 px-3 py-1 text-[10px] text-slate-400">
            ↑↓ navigate · Enter select · keep typing for free text
          </div>
        </div>
      )}
    </div>
  );
}
type Boq = {
  id: string; ref: string; title: string; status: string; currency: string; notes: string | null;
  site: { name: string; code: string } | null;
  createdBy: { name: string };
  createdAt: string;
  items: BoqItem[];
  totals: { subtotal: number; tax: number; total: number };
};

const emptyItem = { description: "", unit: "cu.m", qty: 0, rate: 0, remark: "" };

export default function BoqPage() {
  const [boqs, setBoqs] = useState<Boq[]>([]);
  const [sites, setSites] = useState<{ id: string; name: string }[]>([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Boq | null>(null);
  type FormState = { title: string; siteId: string; currency: string; notes: string; status: string; items: BoqItem[] };
  const [form, setForm] = useState<FormState>({ title: "", siteId: "", currency: "NPR", notes: "", status: "DRAFT", items: [{ ...emptyItem }] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [inv, setInv] = useState<InvOption[]>([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/boq");
    if (res.ok) setBoqs((await res.json()).boqs);
  }, []);

  useEffect(() => {
    load();
    fetch("/api/sites").then((r) => r.ok ? r.json() : null).then((d) => d && setSites(d.sites.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }))));
    fetch("/api/inventory").then((r) => r.ok ? r.json() : null).then((d) => d && setInv(d.items));
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({ title: "", siteId: "", currency: "NPR", notes: "", status: "DRAFT", items: [{ ...emptyItem }] });
    setError("");
    setModal(true);
  }

  function openEdit(b: Boq) {
    setEditing(b);
    setForm({
      title: b.title, siteId: "", currency: b.currency, notes: b.notes ?? "", status: b.status,
      items: b.items.map((i): BoqItem => ({ description: i.description, unit: i.unit, qty: i.qty, rate: i.rate, remark: i.remark ?? "" })),
    });
    setError("");
    setModal(true);
  }

  function setItem(idx: number, patch: Partial<BoqItem>) {
    setForm((f) => ({ ...f, items: f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));
  }
  function addItem() { setForm((f) => ({ ...f, items: [...f.items, { ...emptyItem }] })); }
  function removeItem(idx: number) { setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) })); }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const payload = {
      title: form.title,
      siteId: form.siteId || null,
      currency: form.currency,
      notes: form.notes || null,
      ...(editing && form.status !== "DRAFT" ? { status: form.status } : {}),
      items: form.items.map((i) => ({ description: i.description, unit: i.unit, qty: parseFloat(String(i.qty)) || 0, rate: parseFloat(String(i.rate)) || 0, remark: i.remark || null })),
    };
    const res = await fetch(editing ? `/api/boq/${editing.id}` : "/api/boq", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (!res.ok) { setError((await res.json()).error || "Failed"); return; }
    setModal(false);
    load();
  }

  async function remove(b: Boq) {
    if (!confirm(`Delete ${b.ref}?`)) return;
    await fetch(`/api/boq/${b.id}`, { method: "DELETE" });
    load();
  }

  async function toInvoice(b: Boq) {
    if (!confirm(`Create a draft invoice from ${b.ref}?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/boq/${b.id}/to-invoice`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error((await res.json()).error);
      if (data.converted === false) {
        alert(data.message ?? "This BOQ was already converted to an invoice.");
      } else {
        alert(`Draft invoice ${data.invoice.number} created ✔ — open Invoices to review and send.`);
      }
    } catch (e) {
      alert((e as Error).message || "Conversion failed");
    }
    setBusy(false);
  }

  const curSym = (code: string) => CURRENCIES.find((c) => c.code === code)?.symbol ?? "";

  return (
    <Shell title="Bill of Quantities (BOQ)" subtitle="Estimate materials & work items per site — Nepal PWD-style units">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <a className="btn-outline" href="/api/reports/export?type=boq" target="_blank">⬇ Export all (CSV)</a>
        <button className="btn-primary" onClick={openCreate}>+ New BOQ</button>
      </div>

      {boqs.length === 0 ? (
        <EmptyState title="No BOQs yet" hint="Create a BOQ to estimate quantities and rates for a project." />
      ) : (
        <div className="space-y-4">
          {boqs.map((b) => (
            <div key={b.id} className="card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-extrabold text-slate-900">{b.ref}</p>
                    <Badge className={b.status === "APPROVED" ? "bg-emerald-100 text-emerald-700" : b.status === "SUPERSEDED" ? "bg-slate-100 text-slate-500" : "bg-blue-100 text-blue-700"}>{b.status}</Badge>
                    <Badge className="bg-slate-100 text-slate-600">{b.currency}</Badge>
                  </div>
                  <p className="mt-0.5 text-sm font-semibold text-slate-700">{b.title}</p>
                  <p className="text-xs text-slate-400">{b.site ? `🏗️ ${b.site.name} · ` : ""}by {b.createdBy.name} · {new Date(b.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <p className="text-lg font-extrabold text-slate-900">{curSym(b.currency)}{b.totals.total.toLocaleString("en-IN")}</p>
                    <p className="text-[11px] text-slate-400">{b.items.length} items (pre-VAT estimate)</p>
                  </div>
                  <button className="btn-primary !px-3 !py-1.5 text-xs" disabled={busy} onClick={() => toInvoice(b)}>🧾 BOQ to Invoice</button>
                  <a className="btn-outline !px-3 !py-1.5 text-xs" href={`/api/boq/${b.id}/export?format=csv`}>⬇ CSV</a>
                  <a className="btn-outline !px-3 !py-1.5 text-xs" href={`/api/boq/${b.id}/export?format=pdf`} target="_blank">🖨 PDF</a>
                  <button className="btn-outline !px-3 !py-1.5 text-xs" onClick={() => openEdit(b)}>Edit</button>
                  <button className="btn-outline !px-3 !py-1.5 text-xs text-red-600" onClick={() => remove(b)}>Delete</button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead><tr className="bg-white"><th className="th">Item</th><th className="th">Unit</th><th className="th">Qty</th><th className="th">Rate</th><th className="th">Amount</th></tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {b.items.map((i) => (
                      <tr key={i.id}>
                        <td className="td">{i.description}{i.remark ? <span className="block text-xs text-slate-400">{i.remark}</span> : null}</td>
                        <td className="td">{i.unit}</td>
                        <td className="td">{i.qty}</td>
                        <td className="td">{curSym(b.currency)}{i.rate.toLocaleString("en-IN")}</td>
                        <td className="td font-semibold">{curSym(b.currency)}{(i.qty * i.rate).toLocaleString("en-IN")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? `Edit ${editing.ref}` : "New BOQ"} wide>
        <form onSubmit={save} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">BOQ title</label><input className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Skyline Tower — Structural works" /></div>
            <div>
              <label className="label">Site (optional)</label>
              <select className="input" value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })} disabled={!!editing}>
                <option value="">— None —</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Currency</label>
              <select className="input" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
              </select>
            </div>
            {editing && (
              <div>
                <label className="label">Status</label>
                <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="DRAFT">DRAFT</option><option value="APPROVED">APPROVED</option><option value="SUPERSEDED">SUPERSEDED</option>
                </select>
              </div>
            )}
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="label !mb-0">Items (editable rates — prices fluctuate)</label>
              <button type="button" className="text-xs font-bold text-brand-600 hover:underline" onClick={addItem}>+ Add item</button>
            </div>
            <p className="mb-2 text-[11px] text-slate-400">💡 Type in “Item” to search inventory — picking a suggestion fills unit &amp; last purchase price (still editable).</p>
            <div className="space-y-2">
              {form.items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2">
                  <ItemSuggestInput
                    className="col-span-4"
                    value={it.description}
                    inventory={inv}
                    onChange={(v) => setItem(idx, { description: v })}
                    onPick={(item) => setItem(idx, { description: item.name, unit: item.unit, rate: item.lastPrice })}
                  />
                  <input className="input col-span-2" placeholder="Unit (cu.m)" value={it.unit} onChange={(e) => setItem(idx, { unit: e.target.value })} />
                  <input className="input col-span-2" required type="number" step="any" min={0} placeholder="Qty" value={it.qty || ""} onChange={(e) => setItem(idx, { qty: parseFloat(e.target.value) || 0 })} />
                  <input className="input col-span-3" required type="number" step="any" min={0} placeholder="Rate" value={it.rate || ""} onChange={(e) => setItem(idx, { rate: parseFloat(e.target.value) || 0 })} />
                  <button type="button" className="col-span-1 rounded-lg text-slate-400 hover:text-red-500" onClick={() => removeItem(idx)}>✕</button>
                </div>
              ))}
            </div>
          </div>

          <div><label className="label">Notes</label><textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              Total: <strong>{curSym(form.currency)}{form.items.reduce((s, i) => s + (parseFloat(String(i.qty)) || 0) * (parseFloat(String(i.rate)) || 0), 0).toLocaleString("en-IN")}</strong>
            </p>
            <div className="flex gap-2">
              <button type="button" className="btn-outline" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save BOQ"}</button>
            </div>
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
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

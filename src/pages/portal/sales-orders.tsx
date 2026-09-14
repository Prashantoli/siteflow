import { GetServerSidePropsContext } from "next";
import { getSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import DualDatePicker from "@/components/DualDatePicker";
import { Modal, Badge, StatCard, EmptyState, CurrencySelect, useBaseCurrency } from "@/components/ui";
import { SO_STATUS_LABEL, SO_STATUS_COLOR, NEPAL_VAT_PERCENT } from "@/lib/orders";
import { formatDual } from "@/lib/nepal";
import { homeFor, isManagement } from "@/lib/rbac";

type SoItem = { inventoryId: string | null; description: string; unit: string; qty: number; unitPrice: number; remark?: string };
type Order = {
  id: string; number: string; customerName: string; customerAddress: string | null; customerPhone: string | null; customerVat: string | null;
  status: string; orderDate: string; deliveryDate: string | null; taxPercent: number; discountAmount: number; currency: string; notes: string | null;
  site: { name: string; code: string } | null; createdBy: { name: string };
  items: (SoItem & { id: string; deliveredQty: number })[];
  totals: { subtotal: number; discount: number; tax: number; total: number };
};
type InvItem = { id: string; code: string; name: string; unit: string; lastPrice: number; avgCost: number; stockQty: number };

const emptyItem: SoItem = { inventoryId: null, description: "", unit: "nos", qty: 1, unitPrice: 0, remark: "" };

export default function SalesOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [sites, setSites] = useState<{ id: string; name: string }[]>([]);
  const [inv, setInv] = useState<InvItem[]>([]);
  const [filter, setFilter] = useState("ALL");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({
    customerName: "", customerAddress: "", customerPhone: "", customerVat: "", siteId: "",
    orderDate: new Date().toISOString().slice(0, 10), deliveryDate: "",
    taxPercent: String(NEPAL_VAT_PERCENT), discountAmount: "0", currency: "NPR", notes: "",
    items: [{ ...emptyItem }],
  });
  const base = useBaseCurrency();
  useEffect(() => {
    setForm((f) => (f.currency === "NPR" ? { ...f, currency: base } : f));
  }, [base]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/sales-orders");
    if (res.ok) setOrders((await res.json()).orders);
  }, []);

  useEffect(() => {
    load();
    fetch("/api/sites").then((r) => r.ok ? r.json() : null).then((d) => d && setSites(d.sites.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }))));
    fetch("/api/inventory").then((r) => r.ok ? r.json() : null).then((d) => d && setInv(d.items));
  }, [load]);

  function pickInvItem(idx: number, inventoryId: string) {
    const item = inv.find((i) => i.id === inventoryId);
    setForm((f) => ({
      ...f,
      items: f.items.map((it, i) =>
        i === idx
          ? { ...it, inventoryId: inventoryId || null, description: item ? item.name : it.description, unit: item ? item.unit : it.unit, unitPrice: item ? Math.round(item.avgCost * 1.15) : it.unitPrice }
          : it
      ),
    }));
  }
  function setItem(idx: number, patch: Partial<SoItem>) {
    setForm((f) => ({ ...f, items: f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));
  }
  function addItem() { setForm((f) => ({ ...f, items: [...f.items, { ...emptyItem }] })); }
  function removeItem(idx: number) { setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) })); }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/sales-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: form.customerName,
        customerAddress: form.customerAddress || null,
        customerPhone: form.customerPhone || null,
        customerVat: form.customerVat || null,
        siteId: form.siteId || null,
        orderDate: form.orderDate,
        deliveryDate: form.deliveryDate || null,
        taxPercent: parseFloat(form.taxPercent) || 0,
        discountAmount: parseFloat(form.discountAmount) || 0,
        currency: form.currency,
        notes: form.notes || null,
        items: form.items.map((i) => ({ ...i, qty: parseFloat(String(i.qty)) || 0, unitPrice: parseFloat(String(i.unitPrice)) || 0, remark: i.remark || null })),
      }),
    });
    setBusy(false);
    if (!res.ok) { setError((await res.json()).error || "Failed"); return; }
    setModal(false);
    setForm((f) => ({ ...f, customerName: "", customerAddress: "", customerPhone: "", customerVat: "", notes: "", items: [{ ...emptyItem }] }));
    load();
  }

  async function patch(o: Order, body: Record<string, unknown>) {
    setBusy(true);
    const res = await fetch(`/api/sales-orders/${o.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (!res.ok) alert((await res.json()).error);
    load();
  }

  async function remove(o: Order) {
    if (!confirm(`Delete ${o.number}?`)) return;
    const res = await fetch(`/api/sales-orders/${o.id}`, { method: "DELETE" });
    if (!res.ok) alert((await res.json()).error);
    load();
  }

  const filtered = orders.filter((o) => filter === "ALL" || o.status === filter);
  const totalRev = orders.filter((o) => o.status !== "CANCELLED").reduce((s, o) => s + o.totals.total, 0);
  const pending = orders.filter((o) => ["SUBMITTED", "APPROVED", "PARTIALLY_DELIVERED"].includes(o.status)).length;

  return (
    <Shell title="Sales Orders" subtitle="Sell materials & services to customers — letterhead print, delivery updates stock">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Total SOs" value={orders.length} accent="blue" />
        <StatCard label="Total Revenue" value={`Rs. ${totalRev.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`} accent="brand" />
        <StatCard label="Pending Delivery" value={pending} accent={pending > 0 ? "red" : "emerald"} />
        <StatCard label="Delivered" value={orders.filter((o) => o.status === "DELIVERED").length} accent="emerald" />
      </div>

      <div className="mb-4 mt-6 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {["ALL", "DRAFT", "SUBMITTED", "APPROVED", "DELIVERED", "CANCELLED"].map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold ${filter === s ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}>
              {SO_STATUS_LABEL[s] ?? s}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <a className="btn-outline" href="/api/reports/export?type=sales" target="_blank">⬇ Sales Report CSV</a>
          <button className="btn-primary" onClick={() => setModal(true)}>+ New Sales Order</button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No sales orders" hint="Create an SO to sell materials — stock decrements on delivery." />
      ) : (
        <div className="space-y-3">
          {filtered.map((o) => (
            <div key={o.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-extrabold text-slate-900">{o.number}</p>
                    <Badge className={SO_STATUS_COLOR[o.status]}>{SO_STATUS_LABEL[o.status] ?? o.status}</Badge>
                    <Badge className="bg-slate-100 text-slate-600">{o.currency}</Badge>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-slate-700">{o.customerName}{o.customerVat ? ` · VAT ${o.customerVat}` : ""}</p>
                  <p className="text-xs text-slate-500">
                    {o.site ? `🏗️ ${o.site.name} · ` : ""}ordered {formatDual(o.orderDate)}
                    {o.deliveryDate ? ` · delivery ${formatDual(o.deliveryDate)}` : ""} · {o.items.length} items
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Subtotal Rs.{o.totals.subtotal.toLocaleString("en-IN")} · VAT Rs.{o.totals.tax.toLocaleString("en-IN")} ·
                    Total <strong className="text-slate-600">Rs.{o.totals.total.toLocaleString("en-IN")}</strong>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <a className="btn-outline !px-3 !py-1.5 text-xs" href={`/api/sales-orders/${o.id}/print`} target="_blank">🖨 Print (Letterhead)</a>
                  {o.status === "DRAFT" && <button className="btn-primary !px-3 !py-1.5 text-xs" disabled={busy} onClick={() => patch(o, { status: "SUBMITTED" })}>📤 Submit</button>}
                  {o.status === "SUBMITTED" && <button className="btn-primary !px-3 !py-1.5 text-xs" disabled={busy} onClick={() => patch(o, { status: "APPROVED" })}>✔ Approve</button>}
                  {(o.status === "APPROVED" || o.status === "PARTIALLY_DELIVERED") && (
                    <button className="btn-primary !px-3 !py-1.5 text-xs" disabled={busy} onClick={() => patch(o, { deliverAll: true })}>🚚 Deliver (stock-out)</button>
                  )}
                  {o.status !== "DELIVERED" && o.status !== "CANCELLED" && (
                    <button className="btn-outline !px-3 !py-1.5 text-xs text-red-600" disabled={busy} onClick={() => patch(o, { status: "CANCELLED" })}>Cancel</button>
                  )}
                  {["DRAFT", "SUBMITTED"].includes(o.status) && <button className="btn-outline !px-3 !py-1.5 text-xs text-red-600" onClick={() => remove(o)}>Delete</button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="New Sales Order" wide>
        <form onSubmit={create} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">Customer / buyer name *</label><input className="input" required value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} placeholder="Company or person buying from you" /></div>
            <div><label className="label">Customer PAN/VAT</label><input className="input" value={form.customerVat} onChange={(e) => setForm({ ...form, customerVat: e.target.value })} /></div>
            <div><label className="label">Customer address</label><input className="input" value={form.customerAddress} onChange={(e) => setForm({ ...form, customerAddress: e.target.value })} /></div>
            <div><label className="label">Customer phone</label><input className="input" value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} /></div>
            <div>
              <label className="label">Linked site (optional)</label>
              <select className="input" value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })}>
                <option value="">— None —</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Currency</label>
              <CurrencySelect value={form.currency} onChange={(currency) => setForm({ ...form, currency })} />
            </div>
            <div><DualDatePicker label="Order date" value={form.orderDate} onChange={(v) => setForm({ ...form, orderDate: v })} /></div>
            <div><DualDatePicker label="Delivery date" value={form.deliveryDate} onChange={(v) => setForm({ ...form, deliveryDate: v })} /></div>
            <div><label className="label">VAT % (Nepal standard 13)</label><input className="input" type="number" min={0} max={50} step="0.5" value={form.taxPercent} onChange={(e) => setForm({ ...form, taxPercent: e.target.value })} /></div>
            <div><label className="label">Discount amount</label><input className="input" type="number" min={0} step="any" value={form.discountAmount} onChange={(e) => setForm({ ...form, discountAmount: e.target.value })} /></div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="label !mb-0">Items — pick from inventory or type freely; selling price is editable</label>
              <button type="button" className="text-xs font-bold text-brand-600 hover:underline" onClick={addItem}>+ Add line</button>
            </div>
            <div className="space-y-2">
              {form.items.map((it, idx) => (
                <div key={idx} className="rounded-lg border border-slate-200 p-2">
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-5">
                      <select className="input" value={it.inventoryId ?? ""} onChange={(e) => pickInvItem(idx, e.target.value)}>
                        <option value="">— Free text item —</option>
                        {inv.map((i) => <option key={i.id} value={i.id}>{i.code} · {i.name} (stock {i.stockQty} {i.unit})</option>)}
                      </select>
                    </div>
                    <input className="input col-span-4" required placeholder="Description" value={it.description} onChange={(e) => setItem(idx, { description: e.target.value })} />
                    <input className="input col-span-1" placeholder="Unit" value={it.unit} onChange={(e) => setItem(idx, { unit: e.target.value })} />
                    <input className="input col-span-1" required type="number" step="any" min={0} placeholder="Qty" value={it.qty || ""} onChange={(e) => setItem(idx, { qty: parseFloat(e.target.value) || 0 })} />
                    <button type="button" className="col-span-1 rounded-lg text-slate-400 hover:text-red-500" onClick={() => removeItem(idx)}>✕</button>
                  </div>
                  <div className="mt-2 grid grid-cols-12 gap-2">
                    <input className="input col-span-4" required type="number" step="any" min={0} placeholder="Selling price (editable)" value={it.unitPrice || ""} onChange={(e) => setItem(idx, { unitPrice: parseFloat(e.target.value) || 0 })} />
                    <input className="input col-span-8" placeholder="Remark (optional)" value={it.remark ?? ""} onChange={(e) => setItem(idx, { remark: e.target.value })} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div><label className="label">Notes / terms</label><textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>

          <div className="flex items-center justify-between border-t border-slate-100 pt-3">
            <p className="text-sm text-slate-500">
              Subtotal <strong>Rs.{form.items.reduce((s, i) => s + (parseFloat(String(i.qty)) || 0) * (parseFloat(String(i.unitPrice)) || 0), 0).toLocaleString("en-IN")}</strong>
              {" "}· VAT {form.taxPercent}%
            </p>
            <div className="flex gap-2">
              <button type="button" className="btn-outline" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn-primary" disabled={busy}>{busy ? "Creating…" : "Create SO"}</button>
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

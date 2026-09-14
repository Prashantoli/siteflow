import { GetServerSidePropsContext } from "next";
import { getSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import DualDatePicker from "@/components/DualDatePicker";
import { Modal, Badge, StatCard, EmptyState, CurrencySelect, useBaseCurrency } from "@/components/ui";
import { PO_STATUS_LABEL, PO_STATUS_COLOR, NEPAL_VAT_PERCENT } from "@/lib/orders";
import { formatDual } from "@/lib/nepal";
import { homeFor, isManagement } from "@/lib/rbac";

type PoItem = { inventoryId: string | null; description: string; unit: string; qty: number; unitPrice: number; remark?: string };
type Order = {
  id: string; number: string; vendorName: string; vendorAddress: string | null; vendorPhone: string | null; vendorVat: string | null;
  status: string; orderDate: string; expectedDate: string | null; taxPercent: number; discountAmount: number; currency: string; notes: string | null;
  site: { name: string; code: string } | null; createdBy: { name: string };
  items: (PoItem & { id: string; receivedQty: number })[];
  totals: { subtotal: number; discount: number; tax: number; total: number };
};
type InvItem = { id: string; code: string; name: string; unit: string; lastPrice: number; stockQty: number };

const emptyItem: PoItem = { inventoryId: null, description: "", unit: "nos", qty: 1, unitPrice: 0, remark: "" };

export default function PurchaseOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [sites, setSites] = useState<{ id: string; name: string }[]>([]);
  const [inv, setInv] = useState<InvItem[]>([]);
  const [filter, setFilter] = useState("ALL");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({
    vendorName: "", vendorAddress: "", vendorPhone: "", vendorVat: "", siteId: "",
    orderDate: new Date().toISOString().slice(0, 10), expectedDate: "",
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
    const res = await fetch("/api/purchase-orders");
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
          ? { ...it, inventoryId: inventoryId || null, description: item ? item.name : it.description, unit: item ? item.unit : it.unit, unitPrice: item ? item.lastPrice : it.unitPrice }
          : it
      ),
    }));
  }
  function setItem(idx: number, patch: Partial<PoItem>) {
    setForm((f) => ({ ...f, items: f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));
  }
  function addItem() { setForm((f) => ({ ...f, items: [...f.items, { ...emptyItem }] })); }
  function removeItem(idx: number) { setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) })); }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/purchase-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vendorName: form.vendorName,
        vendorAddress: form.vendorAddress || null,
        vendorPhone: form.vendorPhone || null,
        vendorVat: form.vendorVat || null,
        siteId: form.siteId || null,
        orderDate: form.orderDate,
        expectedDate: form.expectedDate || null,
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
    setForm((f) => ({ ...f, vendorName: "", vendorAddress: "", vendorPhone: "", vendorVat: "", notes: "", items: [{ ...emptyItem }] }));
    load();
  }

  async function patch(o: Order, body: Record<string, unknown>) {
    setBusy(true);
    await fetch(`/api/purchase-orders/${o.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    load();
  }

  async function remove(o: Order) {
    if (!confirm(`Delete ${o.number}?`)) return;
    const res = await fetch(`/api/purchase-orders/${o.id}`, { method: "DELETE" });
    if (!res.ok) alert((await res.json()).error);
    load();
  }

  const filtered = orders.filter((o) => filter === "ALL" || o.status === filter);
  const totalSpend = orders.filter((o) => o.status !== "CANCELLED").reduce((s, o) => s + o.totals.total, 0);
  const pending = orders.filter((o) => o.status === "SUBMITTED").length;

  return (
    <Shell title="Purchase Orders" subtitle="Order materials from vendors — letterhead print, goods receipt updates stock">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Total POs" value={orders.length} accent="blue" />
        <StatCard label="Total Spend" value={`Rs. ${totalSpend.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`} accent="brand" />
        <StatCard label="Pending Approval" value={pending} accent={pending > 0 ? "red" : "emerald"} />
        <StatCard label="Received" value={orders.filter((o) => o.status === "RECEIVED").length} accent="emerald" />
      </div>

      <div className="mb-4 mt-6 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {["ALL", "DRAFT", "SUBMITTED", "APPROVED", "RECEIVED", "CANCELLED"].map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold ${filter === s ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}>
              {PO_STATUS_LABEL[s] ?? s}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <a className="btn-outline" href="/api/reports/export?type=purchase" target="_blank">⬇ Purchase Report CSV</a>
          <button className="btn-primary" onClick={() => setModal(true)}>+ New Purchase Order</button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No purchase orders" hint="Create a PO to buy materials — stock updates on receipt." />
      ) : (
        <div className="space-y-3">
          {filtered.map((o) => (
            <div key={o.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-extrabold text-slate-900">{o.number}</p>
                    <Badge className={PO_STATUS_COLOR[o.status]}>{PO_STATUS_LABEL[o.status] ?? o.status}</Badge>
                    <Badge className="bg-slate-100 text-slate-600">{o.currency}</Badge>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-slate-700">{o.vendorName}{o.vendorVat ? ` · VAT ${o.vendorVat}` : ""}</p>
                  <p className="text-xs text-slate-500">
                    {o.site ? `🏗️ ${o.site.name} · ` : ""}ordered {formatDual(o.orderDate)}
                    {o.expectedDate ? ` · expected ${formatDual(o.expectedDate)}` : ""} · {o.items.length} items
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Subtotal Rs.{o.totals.subtotal.toLocaleString("en-IN")} · VAT Rs.{o.totals.tax.toLocaleString("en-IN")} ·
                    Total <strong className="text-slate-600">Rs.{o.totals.total.toLocaleString("en-IN")}</strong>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <a className="btn-outline !px-3 !py-1.5 text-xs" href={`/api/purchase-orders/${o.id}/print`} target="_blank">🖨 Print (Letterhead)</a>
                  {o.status === "DRAFT" && <button className="btn-primary !px-3 !py-1.5 text-xs" disabled={busy} onClick={() => patch(o, { status: "SUBMITTED" })}>📤 Submit</button>}
                  {o.status === "SUBMITTED" && <button className="btn-primary !px-3 !py-1.5 text-xs" disabled={busy} onClick={() => patch(o, { status: "APPROVED" })}>✔ Approve</button>}
                  {(o.status === "APPROVED" || o.status === "PARTIALLY_RECEIVED") && (
                    <button className="btn-primary !px-3 !py-1.5 text-xs" disabled={busy} onClick={() => patch(o, { receiveAll: true })}>📦 Receive (stock-in)</button>
                  )}
                  {o.status !== "RECEIVED" && o.status !== "CANCELLED" && (
                    <button className="btn-outline !px-3 !py-1.5 text-xs text-red-600" disabled={busy} onClick={() => patch(o, { status: "CANCELLED" })}>Cancel</button>
                  )}
                  {["DRAFT", "SUBMITTED"].includes(o.status) && <button className="btn-outline !px-3 !py-1.5 text-xs text-red-600" onClick={() => remove(o)}>Delete</button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="New Purchase Order" wide>
        <form onSubmit={create} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">Vendor / supplier name *</label><input className="input" required value={form.vendorName} onChange={(e) => setForm({ ...form, vendorName: e.target.value })} placeholder="e.g. Shivam Cement Distributors" /></div>
            <div><label className="label">Vendor PAN/VAT</label><input className="input" value={form.vendorVat} onChange={(e) => setForm({ ...form, vendorVat: e.target.value })} placeholder="e.g. 302123456" /></div>
            <div><label className="label">Vendor address</label><input className="input" value={form.vendorAddress} onChange={(e) => setForm({ ...form, vendorAddress: e.target.value })} /></div>
            <div><label className="label">Vendor phone</label><input className="input" value={form.vendorPhone} onChange={(e) => setForm({ ...form, vendorPhone: e.target.value })} /></div>
            <div>
              <label className="label">Deliver to site</label>
              <select className="input" value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })}>
                <option value="">— None / Head office —</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Currency</label>
              <CurrencySelect value={form.currency} onChange={(currency) => setForm({ ...form, currency })} />
            </div>
            <div><DualDatePicker label="Order date" value={form.orderDate} onChange={(v) => setForm({ ...form, orderDate: v })} /></div>
            <div><DualDatePicker label="Expected delivery" value={form.expectedDate} onChange={(v) => setForm({ ...form, expectedDate: v })} /></div>
            <div><label className="label">VAT % (Nepal standard 13)</label><input className="input" type="number" min={0} max={50} step="0.5" value={form.taxPercent} onChange={(e) => setForm({ ...form, taxPercent: e.target.value })} /></div>
            <div><label className="label">Discount amount</label><input className="input" type="number" min={0} step="any" value={form.discountAmount} onChange={(e) => setForm({ ...form, discountAmount: e.target.value })} /></div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="label !mb-0">Items — pick from inventory or type freely; prices are editable</label>
              <button type="button" className="text-xs font-bold text-brand-600 hover:underline" onClick={addItem}>+ Add line</button>
            </div>
            <div className="space-y-2">
              {form.items.map((it, idx) => (
                <div key={idx} className="rounded-lg border border-slate-200 p-2">
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-5">
                      <select className="input" value={it.inventoryId ?? ""} onChange={(e) => pickInvItem(idx, e.target.value)}>
                        <option value="">— Free text item —</option>
                        {inv.map((i) => <option key={i.id} value={i.id}>{i.code} · {i.name} (stock {i.stockQty})</option>)}
                      </select>
                    </div>
                    <input className="input col-span-4" required placeholder="Description" value={it.description} onChange={(e) => setItem(idx, { description: e.target.value })} />
                    <input className="input col-span-1" placeholder="Unit" value={it.unit} onChange={(e) => setItem(idx, { unit: e.target.value })} />
                    <input className="input col-span-1" required type="number" step="any" min={0} placeholder="Qty" value={it.qty || ""} onChange={(e) => setItem(idx, { qty: parseFloat(e.target.value) || 0 })} />
                    <button type="button" className="col-span-1 rounded-lg text-slate-400 hover:text-red-500" onClick={() => removeItem(idx)}>✕</button>
                  </div>
                  <div className="mt-2 grid grid-cols-12 gap-2">
                    <input className="input col-span-4" required type="number" step="any" min={0} placeholder="Unit price (editable)" value={it.unitPrice || ""} onChange={(e) => setItem(idx, { unitPrice: parseFloat(e.target.value) || 0 })} />
                    <input className="input col-span-8" placeholder="Remark (optional — brand, size, grade…)" value={it.remark ?? ""} onChange={(e) => setItem(idx, { remark: e.target.value })} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div><label className="label">Notes / terms</label><textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Payment terms, delivery instructions…" /></div>

          <div className="flex items-center justify-between border-t border-slate-100 pt-3">
            <p className="text-sm text-slate-500">
              Subtotal <strong>Rs.{form.items.reduce((s, i) => s + (parseFloat(String(i.qty)) || 0) * (parseFloat(String(i.unitPrice)) || 0), 0).toLocaleString("en-IN")}</strong>
              {" "}· VAT {form.taxPercent}%
            </p>
            <div className="flex gap-2">
              <button type="button" className="btn-outline" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn-primary" disabled={busy}>{busy ? "Creating…" : "Create PO"}</button>
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

import { GetServerSidePropsContext } from "next";
import { getSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import DualDatePicker from "@/components/DualDatePicker";
import { Modal, Badge, StatCard, EmptyState, money2, fmtDate } from "@/components/ui";
import { homeFor, isManagement } from "@/lib/rbac";

type Item = { id: string; desc: string; qty: number; unit: string; unitPrice: number };
type Invoice = {
  id: string; number: string; clientName: string; clientEmail: string | null;
  status: string; issueDate: string; dueDate: string; taxPercent: number; notes: string | null;
  site: { id: string; name: string; code: string } | null;
  items: Item[]; payments: { id: string; amount: number; method: string; paidAt: string; reference: string | null }[];
  subtotal: number; tax: number; total: number; paid: number; balance: number;
  createdBy: { name: string };
};

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  SENT: "bg-blue-100 text-blue-700",
  PARTIALLY_PAID: "bg-orange-100 text-orange-700",
  PAID: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-red-100 text-red-700",
};

const emptyForm = { clientName: "", clientEmail: "", clientPhone: "", siteId: "", dueDate: "", taxPercent: "18", notes: "", status: "DRAFT", items: [{ desc: "", qty: "1", unit: "unit", unitPrice: "0" }] };

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [sites, setSites] = useState<{ id: string; name: string }[]>([]);
  const [filter, setFilter] = useState("ALL");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [payFor, setPayFor] = useState<Invoice | null>(null);
  const [payForm, setPayForm] = useState({ amount: "", method: "BANK_TRANSFER", reference: "" });

  const load = useCallback(async () => {
    const res = await fetch("/api/invoices");
    if (res.ok) setInvoices((await res.json()).invoices);
  }, []);

  useEffect(() => {
    load();
    fetch("/api/sites").then((r) => r.ok ? r.json() : null).then((d) => d && setSites(d.sites.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }))));
  }, [load]);

  function setItem(idx: number, patch: Partial<typeof form.items[number]>) {
    setForm((f) => ({ ...f, items: f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));
  }
  function addItem() { setForm((f) => ({ ...f, items: [...f.items, { desc: "", qty: "1", unit: "unit", unitPrice: "0" }] })); }
  function removeItem(idx: number) { setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) })); }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientName: form.clientName,
        clientEmail: form.clientEmail || null,
        clientPhone: form.clientPhone || null,
        siteId: form.siteId || null,
        dueDate: form.dueDate,
        taxPercent: parseFloat(form.taxPercent) || 0,
        notes: form.notes || null,
        status: form.status,
        items: form.items.map((i) => ({ desc: i.desc, qty: parseFloat(i.qty) || 0, unit: i.unit, unitPrice: parseFloat(i.unitPrice) || 0 })),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error || "Failed to create invoice");
      return;
    }
    setModal(false);
    setForm(emptyForm);
    load();
  }

  async function setStatus(inv: Invoice, status: string) {
    setBusy(true);
    await fetch(`/api/invoices/${inv.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    setBusy(false);
    load();
  }

  async function remove(inv: Invoice) {
    if (!confirm(`Delete invoice ${inv.number}?`)) return;
    const res = await fetch(`/api/invoices/${inv.id}`, { method: "DELETE" });
    if (!res.ok) alert((await res.json()).error);
    load();
  }

  function openPay(inv: Invoice) {
    setPayFor(inv);
    setPayForm({ amount: inv.balance.toFixed(2), method: "BANK_TRANSFER", reference: "" });
  }

  async function recordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!payFor) return;
    setBusy(true);
    const res = await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invoiceId: payFor.id,
        amount: parseFloat(payForm.amount),
        method: payForm.method,
        reference: payForm.reference || null,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      alert((await res.json()).error);
      return;
    }
    setPayFor(null);
    load();
  }

  const filtered = invoices.filter((i) => filter === "ALL" || i.status === filter);
  const totals = invoices.reduce(
    (acc, i) => ({
      billed: acc.billed + i.total,
      received: acc.received + i.paid,
      outstanding: acc.outstanding + i.balance,
      overdue: acc.overdue + (i.balance > 0.001 && new Date(i.dueDate) < new Date() ? i.balance : 0),
    }),
    { billed: 0, received: 0, outstanding: 0, overdue: 0 }
  );

  return (
    <Shell title="Invoices & Payments" subtitle="Milestone billing, payment tracking and printable invoices">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Total Billed" value={money2(totals.billed)} accent="blue" />
        <StatCard label="Received" value={money2(totals.received)} accent="emerald" />
        <StatCard label="Outstanding" value={money2(totals.outstanding)} accent="brand" />
        <StatCard label="Overdue" value={money2(totals.overdue)} accent={totals.overdue > 0 ? "red" : "slate"} />
      </div>

      <div className="mb-4 mt-6 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {["ALL", "DRAFT", "SENT", "PARTIALLY_PAID", "PAID", "CANCELLED"].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold ${filter === s ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}
            >
              {s.replace("_", " ")}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <a className="btn-outline" href="/api/reports/export?type=invoices" target="_blank">⬇ Export CSV</a>
          <button className="btn-primary" onClick={() => { setForm(emptyForm); setError(""); setModal(true); }}>+ New Invoice</button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No invoices" hint="Create one from completed work or logged hours." />
      ) : (
        <div className="space-y-3">
          {filtered.map((inv) => (
            <div key={inv.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-extrabold text-slate-900">{inv.number}</p>
                    <Badge className={STATUS_COLOR[inv.status]}>{inv.status.replace("_", " ")}</Badge>
                    {inv.balance > 0.001 && new Date(inv.dueDate) < new Date() && <Badge className="bg-red-600 text-white">OVERDUE</Badge>}
                  </div>
                  <p className="mt-1 text-sm font-semibold text-slate-700">{inv.clientName}</p>
                  <p className="text-xs text-slate-500">
                    {inv.site ? `🏗️ ${inv.site.name} · ` : ""}issued {fmtDate(inv.issueDate)} · due {fmtDate(inv.dueDate)} · {inv.items.length} line item{inv.items.length === 1 ? "" : "s"}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Paid {money2(inv.paid)} of {money2(inv.total)} · balance <strong className={inv.balance > 0 ? "text-red-600" : "text-emerald-600"}>{money2(inv.balance)}</strong>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <a className="btn-outline !px-3 !py-1.5 text-xs" href={`/api/invoices/${inv.id}/pdf`} target="_blank">🖨 Print / PDF</a>
                  {inv.status === "DRAFT" && <button className="btn-primary !px-3 !py-1.5 text-xs" disabled={busy} onClick={() => setStatus(inv, "SENT")}>📤 Send</button>}
                  {(inv.status === "SENT" || inv.status === "PARTIALLY_PAID") && inv.balance > 0.001 && (
                    <button className="btn-primary !px-3 !py-1.5 text-xs" onClick={() => openPay(inv)}>💵 Record Payment</button>
                  )}
                  {inv.status !== "PAID" && inv.status !== "CANCELLED" && inv.status !== "DRAFT" && (
                    <button className="btn-outline !px-3 !py-1.5 text-xs text-red-600" disabled={busy} onClick={() => setStatus(inv, "CANCELLED")}>Cancel</button>
                  )}
                  {inv.status === "PAID" && inv.balance <= 0.001 && <Badge className="bg-emerald-600 text-white">✔ SETTLED</Badge>}
                  {inv.payments.length === 0 && <button className="btn-outline !px-3 !py-1.5 text-xs text-red-600" onClick={() => remove(inv)}>Delete</button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      <Modal open={modal} onClose={() => setModal(false)} title="New Invoice" wide>
        <form onSubmit={create} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">Client name</label><input className="input" required value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} /></div>
            <div>
              <label className="label">Site (optional)</label>
              <select className="input" value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })}>
                <option value="">— None —</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div><label className="label">Client email</label><input className="input" type="email" value={form.clientEmail} onChange={(e) => setForm({ ...form, clientEmail: e.target.value })} /></div>
            <div><label className="label">Client phone</label><input className="input" value={form.clientPhone} onChange={(e) => setForm({ ...form, clientPhone: e.target.value })} /></div>
            <div><DualDatePicker label="Due date" value={form.dueDate} onChange={(v) => setForm({ ...form, dueDate: v })} /></div>
            <div><label className="label">Tax %</label><input className="input" type="number" min={0} max={100} step="0.5" value={form.taxPercent} onChange={(e) => setForm({ ...form, taxPercent: e.target.value })} /></div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="label !mb-0">Line items</label>
              <button type="button" className="text-xs font-bold text-brand-600 hover:underline" onClick={addItem}>+ Add line</button>
            </div>
            <div className="space-y-2">
              {form.items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2">
                  <input className="input col-span-5" required placeholder="Description" value={it.desc} onChange={(e) => setItem(idx, { desc: e.target.value })} />
                  <input className="input col-span-2" required type="number" step="any" min={0} placeholder="Qty" value={it.qty} onChange={(e) => setItem(idx, { qty: e.target.value })} />
                  <input className="input col-span-2" placeholder="Unit" value={it.unit} onChange={(e) => setItem(idx, { unit: e.target.value })} />
                  <input className="input col-span-2" required type="number" step="any" min={0} placeholder="Price" value={it.unitPrice} onChange={(e) => setItem(idx, { unitPrice: e.target.value })} />
                  <button type="button" className="col-span-1 rounded-lg text-slate-400 hover:text-red-500" onClick={() => removeItem(idx)}>✕</button>
                </div>
              ))}
            </div>
          </div>

          <div><label className="label">Notes</label><textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.status === "SENT"} onChange={(e) => setForm({ ...form, status: e.target.checked ? "SENT" : "DRAFT" })} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
              Create as sent (ready for payment)
            </label>
            <p className="text-sm text-slate-500">
              Subtotal: <strong>{money2(form.items.reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.unitPrice) || 0), 0))}</strong>
            </p>
          </div>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-outline" onClick={() => setModal(false)}>Cancel</button>
            <button className="btn-primary" disabled={busy}>{busy ? "Creating…" : "Create invoice"}</button>
          </div>
        </form>
      </Modal>

      {/* Payment modal */}
      <Modal open={!!payFor} onClose={() => setPayFor(null)} title={`Record Payment — ${payFor?.number ?? ""}`}>
        <form onSubmit={recordPayment} className="space-y-3">
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Balance due: <strong>{payFor ? money2(payFor.balance) : ""}</strong>
          </p>
          <div><label className="label">Amount (USD)</label><input className="input" required type="number" min={0.01} step="any" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} /></div>
          <div>
            <label className="label">Method</label>
            <select className="input" value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}>
              <option>BANK_TRANSFER</option><option>CASH</option><option>CARD</option><option>UPI</option><option>CHEQUE</option><option>OTHER</option>
            </select>
          </div>
          <div><label className="label">Reference (optional)</label><input className="input" value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} /></div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-outline" onClick={() => setPayFor(null)}>Cancel</button>
            <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Record payment"}</button>
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

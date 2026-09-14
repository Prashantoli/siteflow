import { prisma } from "@/lib/prisma";
import { getCompany } from "@/lib/settings";

export function computeTotals(
  items: { qty: number; unitPrice: number }[],
  taxPercent: number
) {
  const subtotal = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const tax = Math.round(subtotal * (taxPercent / 100) * 100) / 100;
  return { subtotal, tax, total: subtotal + tax };
}

export async function nextInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.invoice.count();
  return `INV-${year}-${String(count + 1).padStart(3, "0")}`;
}

/** Recompute paid amount and derive invoice status from payments. */
export async function recalcInvoiceStatus(invoiceId: string) {
  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { items: true, payments: true },
  });
  if (!inv) return;
  if (inv.status === "DRAFT" || inv.status === "CANCELLED") return;
  const { total } = computeTotals(inv.items, inv.taxPercent);
  const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
  let status = inv.status;
  if (paid <= 0) status = "SENT";
  else if (paid < total) status = "PARTIALLY_PAID";
  else if (paid >= total) status = "PAID";
  if (status !== inv.status) {
    await prisma.invoice.update({ where: { id: invoiceId }, data: { status } });
  }
}

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const fmtDate = (d: Date | string) => new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

/** Self-contained printable HTML for the invoice PDF/browser print. */
export async function buildInvoiceHtml(invoiceId: string): Promise<string | null> {
  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { items: true, payments: true, site: true },
  });
  if (!inv) return null;
  const company = await getCompany();
  const { subtotal, tax, total } = computeTotals(inv.items, inv.taxPercent);
  const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
  const balance = total - paid;

  const rows = inv.items
    .map(
      (i) => `<tr>
        <td>${escapeHtml(i.desc)}</td>
        <td class="r">${i.qty} ${escapeHtml(i.unit)}</td>
        <td class="r">${money(i.unitPrice)}</td>
        <td class="r">${money(i.qty * i.unitPrice)}</td>
      </tr>`
    )
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"/>
  <title>${inv.number}</title>
  <style>
    body{font-family:system-ui,Segoe UI,Arial,sans-serif;margin:40px;color:#0f172a}
    .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #f59e0b;padding-bottom:16px}
    .brand{font-size:22px;font-weight:800}
    .muted{color:#64748b;font-size:12px}
    table{width:100%;border-collapse:collapse;margin-top:24px;font-size:14px}
    th{background:#f8fafc;text-align:left;padding:10px;border-bottom:2px solid #e2e8f0}
    td{padding:10px;border-bottom:1px solid #e2e8f0}
    .r{text-align:right}
    .totals{margin-top:16px;margin-left:auto;width:280px;font-size:14px}
    .totals div{display:flex;justify-content:space-between;padding:6px 0}
    .grand{font-weight:800;border-top:2px solid #0f172a;font-size:16px}
    .badge{display:inline-block;padding:4px 10px;border-radius:999px;background:#fef3c7;color:#92400e;font-weight:700;font-size:12px}
    @media print{body{margin:16px}}
  </style></head><body>
  <div class="head">
    <div>
      <div class="brand">🏗 ${escapeHtml(company.name)}</div>
      <div class="muted">${escapeHtml(company.address)}</div>
      <div class="muted">${escapeHtml(company.email)} · ${escapeHtml(company.phone)}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:26px;font-weight:800">INVOICE</div>
      <div class="muted">${inv.number}</div>
      <div class="muted">Issued ${fmtDate(inv.issueDate)} · Due ${fmtDate(inv.dueDate)}</div>
      <div class="badge" style="margin-top:6px">${inv.status.replace("_", " ")}</div>
    </div>
  </div>

  <div style="margin-top:24px;display:flex;justify-content:space-between">
    <div>
      <div class="muted" style="font-weight:700;margin-bottom:4px">BILL TO</div>
      <div style="font-weight:700">${escapeHtml(inv.clientName)}</div>
      ${inv.clientEmail ? `<div class="muted">${escapeHtml(inv.clientEmail)}</div>` : ""}
      ${inv.clientPhone ? `<div class="muted">${escapeHtml(inv.clientPhone)}</div>` : ""}
    </div>
    <div style="text-align:right">
      <div class="muted" style="font-weight:700;margin-bottom:4px">SITE</div>
      <div style="font-weight:700">${inv.site ? escapeHtml(inv.site.name) : "—"}</div>
      ${inv.site ? `<div class="muted">${escapeHtml(inv.site.address)}, ${escapeHtml(inv.site.city)}</div>` : ""}
    </div>
  </div>

  <table>
    <thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Unit Price</th><th class="r">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals">
    <div><span>Subtotal</span><span>${money(subtotal)}</span></div>
    <div><span>Tax (${inv.taxPercent}%)</span><span>${money(tax)}</span></div>
    <div class="grand"><span>Total</span><span>${money(total)}</span></div>
    <div><span>Paid</span><span>${money(paid)}</span></div>
    <div style="font-weight:700"><span>Balance Due</span><span>${money(balance)}</span></div>
  </div>

  ${inv.notes ? `<p class="muted" style="margin-top:24px">Notes: ${escapeHtml(inv.notes)}</p>` : ""}
  <script>window.onload = () => window.print()</script>
  </body></html>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

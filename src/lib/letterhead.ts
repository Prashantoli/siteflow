import { prisma } from "@/lib/prisma";
import { getCompany } from "@/lib/settings";
import { orderTotals } from "@/lib/orders";
import { formatDual } from "@/lib/nepal";
import { formatMoney } from "@/lib/currency";

type DocKind = "PO" | "SO";

/**
 * Builds a print-ready document on the company letterhead:
 * header with company identity + PAN/VAT, dual BS/AD dates,
 * party block, items table, totals with discount + VAT, signature lines.
 */
export async function buildOrderHtml(kind: DocKind, orderId: string): Promise<string | null> {
  const isPo = kind === "PO";
  const order = isPo
    ? await prisma.purchaseOrder.findUnique({ where: { id: orderId }, include: { items: true, site: true } })
    : await prisma.salesOrder.findUnique({ where: { id: orderId }, include: { items: true, site: true } });
  if (!order) return null;

  const company = await getCompany();
  const items = order.items as { description: string; unit: string; qty: number; unitPrice: number; remark?: string | null }[];
  const totals = orderTotals(items, order.taxPercent, order.discountAmount);
  const cur = order.currency;
  const m = (n: number) => formatMoney(n, cur);

  const number = isPo ? (order as any).number : (order as any).number;
  const partyName = isPo ? (order as any).vendorName : (order as any).customerName;
  const partyAddress = isPo ? (order as any).vendorAddress : (order as any).customerAddress;
  const partyPhone = isPo ? (order as any).vendorPhone : (order as any).customerPhone;
  const partyVat = isPo ? (order as any).vendorVat : (order as any).customerVat;
  const orderDate = (order as any).orderDate as Date;
  const secondDateRaw = isPo ? (order as any).expectedDate : (order as any).deliveryDate;
  const secondLabel = isPo ? "Expected Delivery" : "Delivery Date";

  const rows = items
    .map(
      (i, idx) => `<tr>
        <td class="c">${idx + 1}</td>
        <td>${escapeHtml(i.description)}${i.remark ? `<div class="remark">${escapeHtml(i.remark)}</div>` : ""}</td>
        <td class="c">${escapeHtml(i.unit)}</td>
        <td class="r">${i.qty}</td>
        <td class="r">${m(i.unitPrice)}</td>
        <td class="r">${m(i.qty * i.unitPrice)}</td>
      </tr>`
    )
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"/>
  <title>${number}</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:"Segoe UI",system-ui,Arial,sans-serif;margin:0;color:#0f172a;background:#f1f5f9}
    .page{max-width:800px;margin:24px auto;background:#fff;border:1px solid #e2e8f0;padding:36px 44px}
    /* Letterhead */
    .lh{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px double #0f172a;padding-bottom:14px}
    .lh .left{display:flex;gap:14px;align-items:center}
    .lh .logo{width:64px;height:64px;border:2px solid #b45309;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:30px}
    .lh h1{margin:0;font-size:22px;letter-spacing:.3px}
    .lh .tag{font-size:11px;color:#b45309;font-weight:700;text-transform:uppercase;letter-spacing:2px;margin-top:2px}
    .lh .addr{font-size:12px;color:#475569;margin-top:4px;line-height:1.5}
    .lh .right{text-align:right;font-size:12px;color:#334155;line-height:1.7}
    .lh .right .pan{font-weight:700}
    /* Title bar */
    .doc-title{margin:18px 0 0;text-align:center}
    .doc-title span{display:inline-block;border:1.5px solid #0f172a;padding:6px 28px;font-weight:800;font-size:15px;letter-spacing:2px;border-radius:3px}
    .meta{display:flex;justify-content:space-between;font-size:12.5px;margin-top:14px;gap:24px}
    .meta .box{flex:1;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px}
    .meta .label{font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:1px}
    .meta .val{font-weight:700;margin-top:2px}
    .meta .sub{font-size:11.5px;color:#64748b}
    table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12.5px}
    th{background:#0f172a;color:#fff;padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.6px}
    td{padding:8px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top}
    .r{text-align:right}.c{text-align:center}
    .remark{font-size:10.5px;color:#64748b;margin-top:2px}
    tfoot td{border:none;padding:4px 10px}
    .totals{margin-top:10px;margin-left:auto;width:300px;font-size:12.5px}
    .totals .line{display:flex;justify-content:space-between;padding:4px 0}
    .totals .grand{border-top:2px solid #0f172a;font-weight:800;font-size:14px;padding-top:6px;margin-top:4px}
    .amount-words{margin-top:10px;font-size:12px;color:#334155}
    .notes{margin-top:14px;font-size:12px;color:#475569;border-left:3px solid #b45309;padding:6px 12px;background:#fffbeb}
    .sign{display:flex;justify-content:space-between;margin-top:56px;font-size:12px}
    .sign .s{text-align:center;width:180px}
    .sign .line{border-top:1px solid #0f172a;margin-top:34px;padding-top:5px;font-weight:700}
    .stamp{margin-top:4px;font-size:10.5px;color:#94a3b8}
    .foot{margin-top:28px;border-top:1px solid #e2e8f0;padding-top:10px;font-size:10.5px;color:#94a3b8;display:flex;justify-content:space-between}
    @media print{body{background:#fff}.page{margin:0;border:none;padding:20px 26px}}
  </style></head><body>
  <div class="page">
    <!-- LETTERHEAD -->
    <div class="lh">
      <div class="left">
        <div class="logo">🏗</div>
        <div>
          <h1>${escapeHtml(company.name)}</h1>
          <div class="tag">Building Nepal's Future</div>
          <div class="addr">${escapeHtml(company.address || "")}</div>
        </div>
      </div>
      <div class="right">
        ${company.phone ? `<div>📞 ${escapeHtml(company.phone)}</div>` : ""}
        ${company.email ? `<div>✉ ${escapeHtml(company.email)}</div>` : ""}
        <div class="pan">PAN/VAT: 999999999</div>
      </div>
    </div>

    <div class="doc-title"><span>${isPo ? "PURCHASE ORDER" : "SALES ORDER"}</span></div>

    <div class="meta">
      <div class="box">
        <div class="label">${isPo ? "Vendor / Supplier" : "Bill To / Customer"}</div>
        <div class="val">${escapeHtml(partyName)}</div>
        ${partyAddress ? `<div class="sub">${escapeHtml(partyAddress)}</div>` : ""}
        ${partyPhone ? `<div class="sub">📞 ${escapeHtml(partyPhone)}</div>` : ""}
        ${partyVat ? `<div class="sub">PAN/VAT: ${escapeHtml(partyVat)}</div>` : ""}
      </div>
      <div class="box">
        <div class="label">Order Details</div>
        <div class="val">${number}</div>
        <div class="sub">Order Date: ${formatDual(orderDate)}</div>
        ${secondDateRaw ? `<div class="sub">${secondLabel}: ${formatDual(secondDateRaw)}</div>` : ""}
        ${order.site ? `<div class="sub">Site: ${escapeHtml(order.site.name)}</div>` : ""}
      </div>
    </div>

    <table>
      <thead>
        <tr><th style="width:34px" class="c">S.N.</th><th>Description</th><th style="width:70px" class="c">Unit</th><th style="width:60px" class="r">Qty</th><th style="width:100px" class="r">Rate (${cur})</th><th style="width:110px" class="r">Amount</th></tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr><td colspan="4" class="r"><strong>Subtotal</strong></td><td colspan="2" class="r">${m(totals.subtotal)}</td></tr>
        ${totals.discount > 0 ? `<tr><td colspan="4" class="r"><strong>Discount</strong></td><td colspan="2" class="r">− ${m(totals.discount)}</td></tr>` : ""}
        <tr><td colspan="4" class="r"><strong>VAT (${order.taxPercent}%)</strong></td><td colspan="2" class="r">${m(totals.tax)}</td></tr>
        <tr><td colspan="4" class="r"><strong style="font-size:14px">Grand Total (${cur})</strong></td><td colspan="2" class="r"><strong style="font-size:14px">${m(totals.total)}</strong></td></tr>
      </tfoot>
    </table>

    <div class="notes">
      <strong>Notes:</strong> ${escapeHtml(order.notes || "—")}<br/>
      <span style="font-size:11px">All amounts in ${cur}. Prices are subject to market fluctuation unless fixed by mutual agreement.</span>
    </div>

    <div class="sign">
      <div class="s"><div class="line">Prepared By</div><div class="stamp">Name / Date</div></div>
      <div class="s"><div class="line">Checked By</div><div class="stamp">Name / Date</div></div>
      <div class="s"><div class="line">Authorized By</div><div class="stamp">Signature & Company Seal</div></div>
    </div>

    <div class="foot">
      <span>This is a computer-generated document.</span>
      <span>${escapeHtml(company.name)} · ${escapeHtml(company.phone || "")}</span>
    </div>
  </div>
  </body></html>`;
}

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

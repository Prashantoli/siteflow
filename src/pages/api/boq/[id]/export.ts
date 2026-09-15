import { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { bad, apiManagement } from "@/lib/api";
import { toCsv, sendCsv } from "@/lib/export";
import { orderTotals } from "@/lib/orders";
import { formatDual } from "@/lib/nepal";
import { getCompany } from "@/lib/settings";

function escapeHtmlLocal(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

/** GET /api/boq/[id]/export?format=csv|pdf — individual BOQ export. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const me = await apiManagement(req, res);
    if (!me) return bad(res, "Forbidden", 403);

    const id = typeof req.query.id === "string" ? req.query.id : "";
    if (!id) return bad(res, "Missing id", 400);

    const boq = await prisma.boq.findUnique({
      where: { id },
      include: { items: true, site: true, createdBy: { select: { name: true } } },
    });
    if (!boq) return bad(res, "BOQ not found", 404);

    const totals = orderTotals(boq.items, 0);
    const fmt = (req.query.format as string) || "csv";

    if (fmt === "csv") {
      const rows: (string | number)[][] = boq.items.map((i) => [
        boq.ref, boq.title, boq.site?.name ?? "", i.description, i.unit, i.qty, i.rate, +(i.qty * i.rate).toFixed(2), i.remark ?? "",
      ]);
      rows.push([boq.ref, "TOTAL", "", "", "", "", "", totals.total, ""]);
      sendCsv(
        res,
        toCsv(["BOQ Ref", "Title", "Site", "Item", "Unit", "Qty", "Rate", "Amount", "Remark"], rows),
        `${boq.ref}.csv`
      );
      return;
    }

    if (fmt === "pdf") {
      const company = await getCompany();
      const cur = boq.currency || "NPR";
      const sym = cur === "NPR" ? "Rs." : cur === "USD" ? "$" : "";
      const money = (n: number) => `${sym}${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const rows = boq.items
        .map(
          (i, n) => `<tr>
        <td>${n + 1}</td>
        <td>${escapeHtmlLocal(i.description)}${i.remark ? `<span class="rm"> — ${escapeHtmlLocal(i.remark)}</span>` : ""}</td>
        <td class="c">${escapeHtmlLocal(i.unit)}</td>
        <td class="r">${i.qty}</td>
        <td class="r">${money(i.rate)}</td>
        <td class="r">${money(i.qty * i.rate)}</td>
      </tr>`
        )
        .join("");

      const html = `<!doctype html><html><head><meta charset="utf-8"/>
  <title>${boq.ref} — ${boq.title}</title>
  <style>
    body{font-family:system-ui,Segoe UI,Arial,sans-serif;margin:40px;color:#0f172a}
    .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #f59e0b;padding-bottom:16px}
    .brand{font-size:22px;font-weight:800}
    .muted{color:#64748b;font-size:12px}
    table{width:100%;border-collapse:collapse;margin-top:24px;font-size:13px}
    th{background:#f8fafc;text-align:left;padding:8px;border-bottom:2px solid #e2e8f0}
    td{padding:8px;border-bottom:1px solid #e2e8f0}
    .r{text-align:right}.c{text-align:center}
    .rm{color:#94a3b8;font-size:11px}
    .totals{margin-top:16px;margin-left:auto;width:260px;font-size:14px}
    .totals div{display:flex;justify-content:space-between;padding:5px 0}
    .grand{font-weight:800;border-top:2px solid #0f172a;font-size:16px}
    @media print{body{margin:16px}}
  </style></head><body>
  <div class="head">
    <div>
      <div class="brand">🏗 ${escapeHtmlLocal(company.name)}</div>
      <div class="muted">${escapeHtmlLocal(company.address)}</div>
      <div class="muted">${escapeHtmlLocal(company.email)} · ${escapeHtmlLocal(company.phone)}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:24px;font-weight:800">BILL OF QUANTITIES</div>
      <div class="muted">${boq.ref}</div>
      <div class="muted">${formatDual(boq.createdAt)}</div>
      <div class="muted">Currency: ${cur}</div>
      <div class="muted">Prepared by: ${escapeHtmlLocal(boq.createdBy.name)}</div>
    </div>
  </div>

  <div style="margin-top:20px">
    <div style="font-weight:800">${escapeHtmlLocal(boq.title)}</div>
    ${boq.site ? `<div class="muted">Site: ${escapeHtmlLocal(boq.site.name)} (${escapeHtmlLocal(boq.site.code)}) — ${escapeHtmlLocal(boq.site.address)}, ${escapeHtmlLocal(boq.site.city)}</div>` : ""}
    ${boq.notes ? `<div class="muted" style="margin-top:6px">Notes: ${escapeHtmlLocal(boq.notes)}</div>` : ""}
  </div>

  <table>
    <thead><tr><th style="width:36px">#</th><th>Description</th><th class="c">Unit</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals">
    <div><span>Subtotal</span><span>${money(totals.subtotal)}</span></div>
    <div class="grand"><span>Total (pre-VAT estimate)</span><span>${money(totals.total)}</span></div>
  </div>

  <script>window.onload = () => window.print()</script>
  </body></html>`;

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(html);
      return;
    }

    return bad(res, "Unknown format — use csv or pdf", 400);
  } catch (e) {
    console.error("[boq export]", e);
    return bad(res, "Internal server error", 500);
  }
}

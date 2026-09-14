import { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { bad } from "@/lib/api";
import { toCsv, sendCsv } from "@/lib/export";
import { apiManagement } from "@/lib/api";
import { computeTotals } from "@/lib/invoicing";

/** GET /api/reports/export?type=employees|attendance|sites|invoices|purchase|sales|inventory|boq */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const me = await apiManagement(req, res);
    if (!me) return bad(res, "Forbidden", 403);
    const type = (req.query.type as string) || "employees";
    const stamp = new Date().toISOString().slice(0, 10);

    if (type === "purchase") {
      const { orderTotals } = await import("@/lib/orders");
      const { formatBs } = await import("@/lib/nepal");
      const orders = await prisma.purchaseOrder.findMany({ include: { items: true, site: true }, orderBy: { orderDate: "desc" } });
      const rows = orders.map((o) => {
        const t = orderTotals(o.items, o.taxPercent, o.discountAmount);
        return [o.number, o.vendorName, o.site?.name ?? "", o.status, o.currency, o.orderDate.toISOString().slice(0, 10), formatBs(o.orderDate), t.subtotal, t.discount, t.tax, t.total, o.items.length];
      });
      sendCsv(res, toCsv(["PO No", "Vendor", "Site", "Status", "Currency", "Date (AD)", "Date (BS)", "Subtotal", "Discount", "VAT", "Total", "Lines"], rows), `purchase-report-${stamp}.csv`);
      return;
    }

    if (type === "sales") {
      const { orderTotals } = await import("@/lib/orders");
      const { formatBs } = await import("@/lib/nepal");
      const orders = await prisma.salesOrder.findMany({ include: { items: true, site: true }, orderBy: { orderDate: "desc" } });
      const rows = orders.map((o) => {
        const t = orderTotals(o.items, o.taxPercent, o.discountAmount);
        return [o.number, o.customerName, o.site?.name ?? "", o.status, o.currency, o.orderDate.toISOString().slice(0, 10), formatBs(o.orderDate), t.subtotal, t.discount, t.tax, t.total, o.items.length];
      });
      sendCsv(res, toCsv(["SO No", "Customer", "Site", "Status", "Currency", "Date (AD)", "Date (BS)", "Subtotal", "Discount", "VAT", "Total", "Lines"], rows), `sales-report-${stamp}.csv`);
      return;
    }

    if (type === "inventory") {
      const items = await prisma.inventoryItem.findMany({ orderBy: { name: "asc" } });
      const rows = items.map((i) => [i.code, i.name, i.category ?? "", i.unit, i.stockQty, i.minStock, i.avgCost, i.lastPrice, +(i.stockQty * i.avgCost).toFixed(2), i.stockQty <= i.minStock ? "LOW" : "OK", i.isActive ? "ACTIVE" : "ARCHIVED"]);
      sendCsv(res, toCsv(["Code", "Item", "Category", "Unit", "Stock", "Min Stock", "Avg Cost", "Last Price", "Stock Value", "Stock State", "Status"], rows), `inventory-${stamp}.csv`);
      return;
    }

    if (type === "boq") {
      const { orderTotals } = await import("@/lib/orders");
      const boqs = await prisma.boq.findMany({ include: { items: true, site: true } });
      const rows: (string | number)[][] = [];
      for (const b of boqs) {
        const t = orderTotals(b.items, 0);
        for (const i of b.items) {
          rows.push([b.ref, b.title, b.site?.name ?? "", i.description, i.unit, i.qty, i.rate, i.qty * i.rate]);
        }
        rows.push([b.ref, "TOTAL", "", "", "", "", "", t.total]);
      }
      sendCsv(res, toCsv(["BOQ Ref", "Title", "Site", "Item", "Unit", "Qty", "Rate", "Amount"], rows), `boq-${stamp}.csv`);
      return;
    }

    if (type === "employees") {
      const users = await prisma.user.findMany({
        where: { role: "EMPLOYEE" },
        include: { assignments: { include: { task: true } }, attendance: true },
      });
      const rows = users.map((u) => {
        const completed = u.assignments.filter((a) => a.status === "COMPLETED").length;
        const open = u.assignments.filter((a) => a.status !== "COMPLETED").length;
        const minutes = u.attendance.reduce((s, a) => s + a.workedMinutes, 0);
        const lateDays = u.attendance.filter((a) => a.status === "LATE").length;
        return [u.name, u.jobTitle ?? "", u.status, completed, open, +(minutes / 60).toFixed(1), lateDays, u.hourlyRate];
      });
      sendCsv(
        res,
        toCsv(["Name", "Job Title", "Status", "Tasks Completed", "Open Tasks", "Hours Worked", "Late Days", "Hourly Rate"], rows),
        `employees-${stamp}.csv`
      );
      return;
    }

    if (type === "attendance") {
      const records = await prisma.attendance.findMany({
        include: { user: { select: { name: true } }, site: { select: { name: true, code: true } } },
        orderBy: { checkInAt: "desc" },
        take: 2000,
      });
      const rows = records.map((r) => [
        r.user.name,
        r.site.code,
        r.checkInAt.toISOString(),
        r.checkOutAt ? r.checkOutAt.toISOString() : "",
        +(r.workedMinutes / 60).toFixed(2),
        r.status,
        r.withinGeofence ? "YES" : "NO",
      ]);
      sendCsv(
        res,
        toCsv(["Employee", "Site", "Check In", "Check Out", "Hours", "Status", "In Geofence"], rows),
        `attendance-${stamp}.csv`
      );
      return;
    }

    if (type === "sites") {
      const sites = await prisma.site.findMany({
        include: { tasks: true, members: true },
      });
      const rows = sites.map((s) => {
        const done = s.tasks.filter((t) => t.status === "COMPLETED").length;
        const progress = s.tasks.length ? Math.round(s.tasks.reduce((a, t) => a + t.progress, 0) / s.tasks.length) : 0;
        return [s.code, s.name, s.city, s.status, s.members.length, s.tasks.length, done, `${progress}%`, s.budget];
      });
      sendCsv(
        res,
        toCsv(["Code", "Site", "City", "Status", "Workers", "Tasks", "Completed", "Avg Progress", "Budget"], rows),
        `sites-${stamp}.csv`
      );
      return;
    }

    if (type === "invoices") {
      const invoices = await prisma.invoice.findMany({ include: { items: true, payments: true, site: true } });
      const rows = invoices.map((inv) => {
        const { total } = computeTotals(inv.items, inv.taxPercent);
        const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
        return [inv.number, inv.clientName, inv.site?.name ?? "", inv.status, total, paid, total - paid, inv.dueDate.toISOString().slice(0, 10)];
      });
      sendCsv(
        res,
        toCsv(["Number", "Client", "Site", "Status", "Total", "Paid", "Balance", "Due Date"], rows),
        `invoices-${stamp}.csv`
      );
      return;
    }

    return bad(res, "Unknown report type", 400);
  } catch (e) {
    console.error("[reports export]", e);
    return bad(res, "Internal server error", 500);
  }
}

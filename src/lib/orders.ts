import { prisma } from "@/lib/prisma";

export type OrderLine = { qty: number; unitPrice?: number; rate?: number };

/**
 * Order totals — Nepal convention: discount applied first, then VAT
 * (default 13% in Nepal) on the discounted amount.
 * Accepts BOQ lines (`rate`) and PO/SO lines (`unitPrice`).
 */
export function orderTotals(items: OrderLine[], taxPercent: number, discountAmount = 0) {
  const subtotal = items.reduce((s, i) => s + i.qty * (i.unitPrice ?? i.rate ?? 0), 0);
  const discount = Math.min(Math.max(discountAmount, 0), subtotal);
  const taxable = subtotal - discount;
  const tax = Math.round(taxable * (taxPercent / 100) * 100) / 100;
  return { subtotal, discount, taxable, tax, total: taxable + tax };
}

export async function nextPoNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.purchaseOrder.count();
  return `PO-${year}-${String(count + 1).padStart(3, "0")}`;
}

export async function nextSoNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.salesOrder.count();
  return `SO-${year}-${String(count + 1).padStart(3, "0")}`;
}

export async function nextBoqRef(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.boq.count();
  return `BOQ-${year}-${String(count + 1).padStart(3, "0")}`;
}

export const PO_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  PARTIALLY_RECEIVED: "Partially Received",
  RECEIVED: "Received",
  CANCELLED: "Cancelled",
};

export const SO_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  PARTIALLY_DELIVERED: "Partially Delivered",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

export const PO_STATUS_COLOR: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  SUBMITTED: "bg-blue-100 text-blue-700",
  APPROVED: "bg-violet-100 text-violet-700",
  PARTIALLY_RECEIVED: "bg-orange-100 text-orange-700",
  RECEIVED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-red-100 text-red-700",
};

export const SO_STATUS_COLOR: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  SUBMITTED: "bg-blue-100 text-blue-700",
  APPROVED: "bg-violet-100 text-violet-700",
  PARTIALLY_DELIVERED: "bg-orange-100 text-orange-700",
  DELIVERED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-red-100 text-red-700",
};

/** Nepal VAT rate used as default on new documents. */
export const NEPAL_VAT_PERCENT = 13;

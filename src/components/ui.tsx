import { ReactNode } from "react";
import { clsx } from "clsx";

export function StatCard({
  label,
  value,
  sub,
  accent = "brand",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: "brand" | "blue" | "emerald" | "red" | "slate";
}) {
  const accents: Record<string, string> = {
    brand: "bg-brand-500/10 text-brand-700",
    blue: "bg-blue-500/10 text-blue-700",
    emerald: "bg-emerald-500/10 text-emerald-700",
    red: "bg-red-500/10 text-red-700",
    slate: "bg-slate-500/10 text-slate-700",
  };
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <span className={clsx("h-8 w-8 rounded-lg", accents[accent])} />
      </div>
      <p className="mt-2 text-2xl font-extrabold text-slate-900">{value}</p>
      {sub ? <p className="mt-1 text-xs text-slate-500">{sub}</p> : null}
    </div>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={clsx("badge", className)}>{children}</span>;
}

export function Progress({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  const color = v >= 100 ? "bg-emerald-500" : v >= 50 ? "bg-blue-500" : "bg-brand-500";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={clsx("h-full rounded-full transition-all", color)} style={{ width: `${v}%` }} />
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
      <span className="text-3xl">🗂️</span>
      <p className="mt-2 font-semibold text-slate-700">{title}</p>
      {hint ? <p className="mt-1 text-sm text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:p-8">
      <div className={clsx("w-full rounded-2xl bg-white shadow-xl", wide ? "max-w-3xl" : "max-w-lg")}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export const money2 = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export const fmtDate = (d: string | Date) =>
  new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export const fmtDateTime = (d: string | Date) =>
  new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export const fmtTime = (d: string | Date) =>
  new Date(d).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

export const minutesToHm = (m: number) => {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h > 0 ? `${h}h ${mm}m` : `${mm}m`;
};

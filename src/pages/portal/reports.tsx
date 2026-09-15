import { GetServerSidePropsContext } from "next";
import { getSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { StatCard, Progress, Badge, minutesToHm } from "@/components/ui";
import { homeFor, isManagement } from "@/lib/rbac";

type EmpRow = {
  id: string; name: string; jobTitle: string | null; status: string;
  completed: number; open: number; hours: number; lateDays: number; hourlyRate: number;
};
type SiteRow = { id: string; name: string; code: string; status: string; workers: number; tasks: number; done: number; progress: number; budget: number };
type Fin = { billed: number; received: number; outstanding: number; payroll: number };

function qsRange(from: string, to: string): string {
  const p = new URLSearchParams();
  if (from) p.set("from", from);
  if (to) p.set("to", to);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export default function ReportsPage() {
  const [emps, setEmps] = useState<EmpRow[]>([]);
  const [siteRows, setSiteRows] = useState<SiteRow[]>([]);
  const [fin, setFin] = useState<Fin | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);

  const qs = qsRange(from, to);

  async function load() {
    setLoading(true);
    try {
      const [e, s, f] = await Promise.all([
        fetch(`/api/reports/employees${qs}`).then((r) => r.ok ? r.json() : null),
        fetch(`/api/reports/sites${qs}`).then((r) => r.ok ? r.json() : null),
        fetch(`/api/reports/financial${qs}`).then((r) => r.ok ? r.json() : null),
      ]);
      if (e) setEmps(e.employees);
      if (s) setSiteRows(s.sites);
      if (f) setFin(f);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const maxTasks = Math.max(1, ...emps.map((e) => e.completed + e.open));

  return (
    <Shell title="Reports & Analytics" subtitle="Employee performance, site productivity and finances — filterable by date and exportable">
      {/* Date range filter */}
      <div className="card mb-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">From</label>
            <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">To</label>
            <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <button className="btn-primary" disabled={loading} onClick={load}>{loading ? "Loading…" : "Apply filter"}</button>
          {qs && (
            <button
              className="btn-outline"
              onClick={() => { setFrom(""); setTo(""); setTimeout(load, 0); }}
            >
              Clear
            </button>
          )}
          {qs && <span className="text-xs text-slate-500">📅 {from || "any"} → {to || "any"}</span>}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <a className="btn-outline" href={`/api/reports/export?type=employees${qs}`}>⬇ Employees CSV</a>
        <a className="btn-outline" href={`/api/reports/export?type=attendance${qs}`}>⬇ Attendance CSV</a>
        <a className="btn-outline" href={`/api/reports/export?type=sites${qs}`}>⬇ Sites CSV</a>
        <a className="btn-outline" href={`/api/reports/export?type=invoices${qs}`}>⬇ Invoices CSV</a>
        <a className="btn-outline" href={`/api/reports/export?type=boq${qs}`}>⬇ BOQ CSV</a>
        <a className="btn-outline" href={`/api/reports/export?type=inventory${qs}`}>⬇ Inventory CSV</a>
      </div>

      {fin && (
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <StatCard label="Total Billed" value={`$${(fin.billed / 1000).toFixed(1)}k`} accent="blue" />
          <StatCard label="Received" value={`$${(fin.received / 1000).toFixed(1)}k`} accent="emerald" />
          <StatCard label="Outstanding" value={`$${(fin.outstanding / 1000).toFixed(1)}k`} accent="brand" />
          <StatCard label="Labor Cost (all logged hours)" value={`$${(fin.payroll / 1000).toFixed(1)}k`} accent="slate" />
        </div>
      )}

      {/* Employee performance */}
      <div className="card mt-6 overflow-x-auto">
        <div className="flex items-center justify-between px-4 pt-4">
          <h3 className="text-sm font-bold text-slate-800">Employee Performance</h3>
          <span className="text-xs text-slate-400">tasks completed · punctuality · hours</span>
        </div>
        <table className="mt-3 min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Employee</th>
              <th className="th">Completed</th>
              <th className="th">Open</th>
              <th className="th">Workload</th>
              <th className="th">Hours</th>
              <th className="th">Late Days</th>
              <th className="th">Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {emps.map((e) => (
              <tr key={e.id} className="hover:bg-slate-50">
                <td className="td font-medium text-slate-900">{e.name}<span className="ml-1 text-xs text-slate-400">{e.jobTitle}</span></td>
                <td className="td font-bold text-emerald-600">{e.completed}</td>
                <td className="td">{e.open}</td>
                <td className="td w-40"><Progress value={((e.completed + e.open) / maxTasks) * 100} /></td>
                <td className="td">{e.hours.toFixed(1)}h</td>
                <td className="td">{e.lateDays > 0 ? <Badge className="bg-orange-100 text-orange-700">{e.lateDays}</Badge> : "0"}</td>
                <td className="td">${e.hourlyRate}/h</td>
              </tr>
            ))}
            {emps.length === 0 && <tr><td className="td text-slate-400" colSpan={7}>Loading…</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Site productivity */}
      <div className="card mt-6 overflow-x-auto">
        <div className="flex items-center justify-between px-4 pt-4">
          <h3 className="text-sm font-bold text-slate-800">Site Progress & Productivity</h3>
        </div>
        <table className="mt-3 min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Site</th>
              <th className="th">Status</th>
              <th className="th">Workers</th>
              <th className="th">Tasks</th>
              <th className="th">Avg Progress</th>
              <th className="th">Budget</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {siteRows.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="td font-medium text-slate-900">{s.name} <span className="text-xs text-slate-400">{s.code}</span></td>
                <td className="td"><Badge className="bg-slate-100 text-slate-600">{s.status.replace("_", " ")}</Badge></td>
                <td className="td">{s.workers}</td>
                <td className="td">{s.done}/{s.tasks}</td>
                <td className="td w-48"><div className="flex items-center gap-2"><div className="flex-1"><Progress value={s.progress} /></div><span className="text-xs font-bold">{s.progress}%</span></div></td>
                <td className="td">${s.budget.toLocaleString()}</td>
              </tr>
            ))}
            {siteRows.length === 0 && <tr><td className="td text-slate-400" colSpan={6}>Loading…</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
  const session = await getSession(ctx);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  if (!isManagement(session.user as never)) return { redirect: { destination: homeFor(session.user.role), permanent: false } };
  return { props: {} };
}

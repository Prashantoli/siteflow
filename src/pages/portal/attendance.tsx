import { GetServerSidePropsContext } from "next";
import { getSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import DualDatePicker from "@/components/DualDatePicker";
import { Badge, StatCard, EmptyState, fmtDateTime, minutesToHm } from "@/components/ui";
import { homeFor, isManagement } from "@/lib/rbac";

type Record_ = {
  id: string;
  checkInAt: string;
  checkOutAt: string | null;
  workedMinutes: number;
  status: string;
  withinGeofence: boolean;
  user: { id: string; name: string; jobTitle: string | null };
  site: { id: string; name: string; code: string };
};

const STATUS_COLOR: Record<string, string> = {
  PRESENT: "bg-emerald-100 text-emerald-700",
  LATE: "bg-orange-100 text-orange-700",
  HALF_DAY: "bg-blue-100 text-blue-700",
  ABSENT: "bg-red-100 text-red-700",
};

export default function AttendancePage() {
  const [records, setRecords] = useState<Record_[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [sites, setSites] = useState<{ id: string; name: string }[]>([]);
  const [userId, setUserId] = useState("ALL");
  const [siteId, setSiteId] = useState("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);

  const query = useCallback(() => {
    const p = new URLSearchParams();
    if (userId !== "ALL") p.set("userId", userId);
    if (siteId !== "ALL") p.set("siteId", siteId);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return p.toString();
  }, [userId, siteId, from, to]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/attendance?${query()}`);
    if (res.ok) setRecords((await res.json()).records);
    setLoading(false);
  }, [query]);

  useEffect(() => {
    fetch("/api/users?role=EMPLOYEE").then((r) => r.ok ? r.json() : null).then((d) => d && setUsers(d.users));
    fetch("/api/sites").then((r) => r.ok ? r.json() : null).then((d) => d && setSites(d.sites.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }))));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalMinutes = records.reduce((s, r) => s + r.workedMinutes, 0);
  const lateCount = records.filter((r) => r.status === "LATE").length;
  const outsideCount = records.filter((r) => !r.withinGeofence).length;
  const uniqueWorkers = new Set(records.map((r) => r.user.id)).size;

  return (
    <Shell title="Attendance" subtitle="Geofenced check-in/out records and worked hours">
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div>
          <label className="label">Employee</label>
          <select className="input !w-48" value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="ALL">All employees</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Site</label>
          <select className="input !w-48" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            <option value="ALL">All sites</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <div className="!w-44"><DualDatePicker label="From" value={from} onChange={setFrom} /></div>
        </div>
        <div>
          <div className="!w-44"><DualDatePicker label="To" value={to} onChange={setTo} /></div>
        </div>
        <a className="btn-outline" href={`/api/reports/export?type=attendance`} target="_blank">⬇ Export CSV</a>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Records" value={records.length} sub={`${uniqueWorkers} workers`} accent="blue" />
        <StatCard label="Total Hours" value={minutesToHm(totalMinutes)} accent="brand" />
        <StatCard label="Late Arrivals" value={lateCount} accent={lateCount > 0 ? "red" : "emerald"} />
        <StatCard label="Outside Geofence" value={outsideCount} accent={outsideCount > 0 ? "red" : "emerald"} />
      </div>

      <div className="card mt-6 overflow-x-auto">
        {loading ? (
          <p className="p-6 text-sm text-slate-500">Loading…</p>
        ) : records.length === 0 ? (
          <div className="p-6"><EmptyState title="No attendance records" hint="Workers check in from the My Day portal." /></div>
        ) : (
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Employee</th>
                <th className="th">Site</th>
                <th className="th">Check In</th>
                <th className="th">Check Out</th>
                <th className="th">Worked</th>
                <th className="th">Status</th>
                <th className="th">Geofence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="td font-medium text-slate-900">{r.user.name}<span className="ml-1 text-xs text-slate-400">{r.user.jobTitle}</span></td>
                  <td className="td">{r.site.name} <span className="text-xs text-slate-400">{r.site.code}</span></td>
                  <td className="td">{fmtDateTime(r.checkInAt)}</td>
                  <td className="td">{r.checkOutAt ? fmtDateTime(r.checkOutAt) : <Badge className="bg-emerald-100 text-emerald-700">ON SHIFT</Badge>}</td>
                  <td className="td font-semibold">{r.checkOutAt ? minutesToHm(r.workedMinutes) : "…"}</td>
                  <td className="td"><Badge className={STATUS_COLOR[r.status]}>{r.status.replace("_", " ")}</Badge></td>
                  <td className="td">{r.withinGeofence ? "✅" : "⚠️"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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

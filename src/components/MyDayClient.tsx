import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import { Badge, Progress, fmtTime, minutesToHm } from "@/components/ui";
import { TASK_STATUS_LABEL, TASK_STATUS_COLOR, PRIORITY_COLOR } from "@/lib/workforce";
import { isWithinGeofence, formatDistance, haversineMeters } from "@/lib/geo";

export type MyTask = {
  id: string;
  title: string;
  description: string | null;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  progress: number;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  siteId: string;
  siteName: string;
  siteCode: string;
  crewName: string | null;
  startDate: string;
  dueDate: string;
  estimatedHours: number;
};

export default function MyDayClient({
  tasks,
  openShift,
  todays,
  sites,
}: {
  tasks: MyTask[];
  openShift: null | { siteName: string; checkInAt: string };
  todays: { id: string; site: string; checkInAt: string; checkOutAt: string | null; workedMinutes: number; status: string }[];
  sites: { id: string; name: string; code: string; lat: number; lng: number; radiusM: number; address: string; city: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);

  const activeSite = useMemo(() => {
    if (!openShift) return null;
    const today = todays[todays.length - 1];
    return sites.find((s) => s.name === openShift.siteName) ?? null;
  }, [openShift, todays, sites]);

  function getPosition(): Promise<{ lat: number; lng: number }> {
    return new Promise((resolve, reject) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        reject(new Error("Geolocation is not available on this device"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        (err) => reject(new Error(err.code === err.PERMISSION_DENIED ? "Location permission denied — allow location access to check in" : "Could not get your location")),
        { enableHighAccuracy: true, timeout: 12000 }
      );
    });
  }

  async function refresh() {
    router.replace(router.asPath);
  }

  async function doCheckOut() {
    setBusy(true);
    setMsg(null);
    try {
      const p = await getPosition();
      const res = await fetch("/api/attendance/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...p }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.details?.withinGeofence === false) {
          const site = activeSite;
          const dist = site ? haversineMeters(p.lat, p.lng, site.lat, site.lng) : null;
          if (!confirm(`You appear to be ${dist !== null ? formatDistance(dist) : "far"} from ${openShift?.siteName}. Check out anyway?`)) {
            setBusy(false);
            return;
          }
          const res2 = await fetch("/api/attendance/checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...p, force: true }),
          });
          if (!res2.ok) throw new Error((await res2.json()).error);
        } else {
          throw new Error(data.error);
        }
      }
      setMsg({ kind: "ok", text: "Checked out — have a good rest!" });
      refresh();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    }
    setBusy(false);
  }

  async function doCheckIn(siteId: string) {
    setBusy(true);
    setMsg(null);
    try {
      const p = await getPosition();
      setPos(p);
      const res = await fetch("/api/attendance/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, ...p }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.details?.withinGeofence === false) {
          const site = sites.find((s) => s.id === siteId);
          const dist = site ? haversineMeters(p.lat, p.lng, site.lat, site.lng) : null;
          if (!confirm(`You are ${dist !== null ? formatDistance(dist) : "too far"} from the site geofence. Check in anyway (flagged)?`)) {
            setBusy(false);
            return;
          }
          const res2 = await fetch("/api/attendance/checkin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ siteId, ...p, force: true }),
          });
          if (!res2.ok) throw new Error((await res2.json()).error);
        } else {
          throw new Error(data.error);
        }
      }
      setMsg({ kind: "ok", text: "Checked in — shift started ✔" });
      refresh();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    }
    setBusy(false);
  }

  async function updateTask(id: string, patch: { status?: string; progress?: number }) {
    setBusy(true);
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setMsg({ kind: "ok", text: "Task updated ✔" });
      refresh();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    }
    setBusy(false);
  }

  const openTasks = tasks.filter((t) => t.status !== "COMPLETED");
  const doneTasks = tasks.filter((t) => t.status === "COMPLETED");
  const totalWorked = todays.reduce((s, t) => s + t.workedMinutes, 0);

  return (
    <div>
      {msg && (
        <div className={`mb-4 rounded-lg px-4 py-2.5 text-sm font-medium ${msg.kind === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {msg.text}
        </div>
      )}

      {/* Check-in / out */}
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Attendance</h3>
            {openShift ? (
              <p className="mt-1 text-sm text-slate-600">
                🟢 On shift at <strong>{openShift.siteName}</strong> since {fmtTime(openShift.checkInAt)}
                {totalWorked > 0 ? ` · ${minutesToHm(totalWorked)} today` : ""}
              </p>
            ) : (
              <p className="mt-1 text-sm text-slate-500">You are not checked in. Select your site to start the shift.</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {pos && <span className="text-xs text-slate-400">📍 {pos.lat.toFixed(4)}, {pos.lng.toFixed(4)}</span>}
            {openShift ? (
              <button className="btn-danger" disabled={busy} onClick={doCheckOut}>Check out</button>
            ) : (
              <div className="flex flex-wrap gap-2">
                {sites.map((s) => (
                  <button key={s.id} className="btn-primary !px-3 !py-1.5 text-xs" disabled={busy} onClick={() => doCheckIn(s.id)}>
                    Check in · {s.code}
                  </button>
                ))}
                {sites.length === 0 && <span className="text-xs text-slate-400">No active sites</span>}
              </div>
            )}
          </div>
        </div>

        {todays.length > 0 && (
          <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
            {todays.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-slate-700">{t.site}</span>
                <span className="text-slate-500">
                  {fmtTime(t.checkInAt)} – {t.checkOutAt ? fmtTime(t.checkOutAt) : "…"} · {minutesToHm(t.workedMinutes)}
                  {t.status === "LATE" && <Badge className="ml-2 bg-orange-100 text-orange-700">LATE</Badge>}
                  {t.status === "HALF_DAY" && <Badge className="ml-2 bg-slate-100 text-slate-600">HALF DAY</Badge>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* My tasks */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h3 className="mb-3 text-sm font-bold text-slate-800">My Open Tasks ({openTasks.length})</h3>
          <div className="space-y-3">
            {openTasks.map((t) => (
              <div key={t.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{t.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">📍 {t.siteName} · 🗓 due {new Date(t.dueDate).toLocaleDateString()}</p>
                  </div>
                  <Badge className={PRIORITY_COLOR[t.priority]}>{t.priority}</Badge>
                </div>
                {t.description ? <p className="mt-1.5 text-xs text-slate-600">{t.description}</p> : null}
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1"><Progress value={t.progress} /></div>
                  <span className="text-xs font-semibold text-slate-500">{t.progress}%</span>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {t.status === "NOT_STARTED" && (
                    <button className="btn-outline !px-3 !py-1 text-xs" disabled={busy} onClick={() => updateTask(t.id, { status: "IN_PROGRESS" })}>
                      ▶ Start
                    </button>
                  )}
                  {t.status === "IN_PROGRESS" && (
                    <>
                      {[25, 50, 75, 100].filter((p) => p > t.progress).map((p) => (
                        <button key={p} className="btn-outline !px-3 !py-1 text-xs" disabled={busy} onClick={() => updateTask(t.id, { progress: p, status: p === 100 ? "COMPLETED" : "IN_PROGRESS" })}>
                          {p === 100 ? "✔ Complete" : `${p}%`}
                        </button>
                      ))}
                    </>
                  )}
                  {t.status === "NOT_STARTED" && (
                    <button className="btn-primary !px-3 !py-1 text-xs" disabled={busy} onClick={() => updateTask(t.id, { progress: 100, status: "COMPLETED" })}>
                      ✔ Complete
                    </button>
                  )}
                </div>
              </div>
            ))}
            {openTasks.length === 0 && <p className="py-4 text-sm text-slate-400">No open tasks — great job! 🎉</p>}
          </div>
        </div>

        <div className="card p-4">
          <h3 className="mb-3 text-sm font-bold text-slate-800">Completed ({doneTasks.length})</h3>
          <ul className="divide-y divide-slate-100">
            {doneTasks.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-700">{t.title}</p>
                  <p className="text-xs text-slate-400">{t.siteName} · {new Date(t.dueDate).toLocaleDateString()}</p>
                </div>
                <Badge className={TASK_STATUS_COLOR.COMPLETED}>DONE</Badge>
              </li>
            ))}
            {doneTasks.length === 0 && <p className="py-4 text-sm text-slate-400">Nothing completed yet.</p>}
          </ul>
        </div>
      </div>

    </div>
  );
}

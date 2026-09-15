import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Circle, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

export type MapWorker = {
  id: string;
  name: string;
  jobTitle: string | null;
  lat: number | null;
  lng: number | null;
  lastSeenAt: string | null;
  busy: boolean;
  siteName: string | null;
  siteLat: number | null;
  siteLng: number | null;
};

export type MapSite = { id: string; name: string; code: string; lat: number; lng: number; radiusM: number };

const COLORS = {
  busy: "#2563eb", // blue
  free: "#10b981", // emerald
  site: "#f59e0b", // amber geofence
};

/** Map auto-fits bounds after markers render. */
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 14);
      return;
    }
    map.fitBounds(points, { padding: [40, 40] });
  }, [map, points]);
  return null;
}

/**
 * Live workforce deployment map: worker last-known positions (from
 * attendance/location pings) + site geofence circles.
 */
export default function WorkforceMap({ workers, sites }: { workers: MapWorker[]; sites: MapSite[] }) {
  const located = workers.filter((w) => w.lat != null && w.lng != null);
  const siteDots: [number, number][] = sites.map((s) => [s.lat, s.lng]);
  const allPoints: [number, number][] = [
    ...located.map((w) => [w.lat as number, w.lng as number] as [number, number]),
    ...siteDots,
  ];

  const center: [number, number] = allPoints[0] ?? [27.7172, 85.324]; // Kathmandu fallback

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-bold text-slate-800">🗺️ Deployment Map — live worker locations</h3>
        <div className="flex items-center gap-3 text-[11px] font-medium text-slate-500">
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLORS.busy }} /> Busy</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLORS.free }} /> Free</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLORS.site }} /> Site geofence</span>
        </div>
      </div>
      <div style={{ height: 420 }}>
        <MapContainer center={center} zoom={8} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {/* Site geofences */}
          {sites.map((s) => (
            <Circle key={s.id} center={[s.lat, s.lng]} radius={s.radiusM} pathOptions={{ color: COLORS.site, fillColor: COLORS.site, fillOpacity: 0.08, weight: 1.5 }}>
              <Popup>
                <strong>{s.name}</strong> ({s.code})<br />Geofence radius: {s.radiusM} m
              </Popup>
            </Circle>
          ))}
          {/* Workers with a known location */}
          {located.map((w) => (
            <CircleMarker
              key={w.id}
              center={[w.lat as number, w.lng as number]}
              radius={8}
              pathOptions={{ color: "#fff", weight: 2, fillColor: w.busy ? COLORS.busy : COLORS.free, fillOpacity: 0.95 }}
            >
              <Popup>
                <strong>👷 {w.name}</strong>
                {w.jobTitle ? <span className="text-slate-500"> · {w.jobTitle}</span> : null}
                <br />
                {w.siteName ? <>📍 Deployed at {w.siteName}</> : "Not deployed"}
                <br />
                {w.lastSeenAt ? <span className="text-slate-400">📡 Last ping: {new Date(w.lastSeenAt).toLocaleString()}</span> : <span className="text-slate-400">No ping yet</span>}
              </Popup>
            </CircleMarker>
          ))}
          <FitBounds points={allPoints} />
        </MapContainer>
      </div>
      {located.length === 0 && (
        <p className="px-4 py-2 text-xs text-slate-400">
          No worker locations yet — workers share location when they check in/out and while the app is open.
        </p>
      )}
    </div>
  );
}

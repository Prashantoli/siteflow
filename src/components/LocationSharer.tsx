import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

/**
 * Pings the API with the device GPS position every 60s so managers see
 * live worker locations. Skips silently when permission is denied.
 */
export default function LocationSharer() {
  const { data: session } = useSession();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!session?.user) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    navigator.geolocation.getCurrentPosition(
      () => setEnabled(true),
      () => setEnabled(false),
      { timeout: 8000 }
    );

    if (enabled) {
      const ping = () =>
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            fetch("/api/attendance/ping", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            }).catch(() => {});
          },
          () => {},
          { enableHighAccuracy: false, timeout: 10000 }
        );
      ping();
      timer = setInterval(ping, 60_000);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [session?.user, enabled]);

  return null;
}

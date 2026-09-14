import { useEffect, useState } from "react";
import Link from "next/link";

type Notif = {
  id: string;
  title: string;
  body: string;
  type: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);

  async function load() {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.notifications);
      setUnread(data.unread);
    } catch {}
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  async function markAll() {
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    load();
  }

  const rel = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100"
        aria-label="Notifications"
      >
        🔔
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
              <p className="text-sm font-bold text-slate-800">Notifications</p>
              <button onClick={markAll} className="text-xs font-semibold text-brand-600 hover:underline">
                Mark all read
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {items.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-400">No notifications yet</p>}
              {items.map((n) => {
                const inner = (
                  <div className={`flex gap-2 border-b border-slate-50 px-4 py-3 hover:bg-slate-50 ${n.isRead ? "opacity-60" : ""}`}>
                    <span className="text-lg">{n.type === "TASK_ASSIGNED" ? "📋" : n.type === "REMINDER" ? "⏰" : n.type === "LOCATION" ? "📍" : "🔔"}</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">{n.title}</p>
                      <p className="line-clamp-2 text-xs text-slate-500">{n.body}</p>
                      <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">{rel(n.createdAt)}</p>
                    </div>
                  </div>
                );
                return n.link ? (
                  <Link key={n.id} href={n.link} onClick={() => setOpen(false)}>
                    {inner}
                  </Link>
                ) : (
                  <div key={n.id}>{inner}</div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

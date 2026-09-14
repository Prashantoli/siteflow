import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { signOut, useSession } from "next-auth/react";
import { clsx } from "clsx";
import NotificationBell from "@/components/NotificationBell";

type NavItem = { href: string; label: string; icon: string; roles: string[] };

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Overview",
    items: [
      { href: "/portal/dashboard", label: "Dashboard", icon: "📊", roles: ["ADMIN", "MANAGER"] },
      { href: "/portal/my-day", label: "My Day", icon: "🗒️", roles: ["EMPLOYEE", "ADMIN", "MANAGER"] },
    ],
  },
  {
    section: "Operations",
    items: [
      { href: "/portal/sites", label: "Sites", icon: "🏗️", roles: ["ADMIN", "MANAGER"] },
      { href: "/portal/tasks", label: "Tasks", icon: "✅", roles: ["ADMIN", "MANAGER"] },
      { href: "/portal/workforce", label: "Workforce", icon: "👷", roles: ["ADMIN", "MANAGER"] },
      { href: "/portal/crews", label: "Crews", icon: "🧰", roles: ["ADMIN", "MANAGER"] },
      { href: "/portal/attendance", label: "Attendance", icon: "🕐", roles: ["ADMIN", "MANAGER"] },
    ],
  },
  {
    section: "Materials & Trade",
    items: [
      { href: "/portal/boq", label: "BOQ", icon: "📐", roles: ["ADMIN", "MANAGER"] },
      { href: "/portal/inventory", label: "Inventory", icon: "📦", roles: ["ADMIN", "MANAGER"] },
      { href: "/portal/purchase-orders", label: "Purchase Orders", icon: "🛒", roles: ["ADMIN", "MANAGER"] },
      { href: "/portal/sales-orders", label: "Sales Orders", icon: "🏷️", roles: ["ADMIN", "MANAGER"] },
    ],
  },
  {
    section: "Finance",
    items: [
      { href: "/portal/invoices", label: "Invoices", icon: "💰", roles: ["ADMIN", "MANAGER"] },
      { href: "/portal/reports", label: "Reports", icon: "📈", roles: ["ADMIN", "MANAGER"] },
    ],
  },
  {
    section: "Administration",
    items: [
      { href: "/portal/users", label: "Users", icon: "👤", roles: ["ADMIN"] },
      { href: "/portal/settings", label: "Settings", icon: "⚙️", roles: ["ADMIN"] },
    ],
  },
];

export default function Shell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const role = session?.user?.role ?? "EMPLOYEE";
  const user = session?.user;

  const NavLinks = () => (
    <nav className="space-y-6">
      {NAV.map((group) => {
        const items = group.items.filter((i) => i.roles.includes(role));
        if (items.length === 0) return null;
        return (
          <div key={group.section}>
            <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">{group.section}</p>
            <ul className="space-y-1">
              {items.map((item) => {
                const active = router.pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={clsx(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                        active ? "bg-brand-600 text-white shadow" : "text-slate-300 hover:bg-slate-800 hover:text-white"
                      )}
                    >
                      <span>{item.icon}</span>
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Sidebar */}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-40 w-64 transform bg-slate-900 transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 items-center gap-2 border-b border-slate-800 px-5">
          <span className="text-2xl">🏗️</span>
          <div>
            <p className="text-sm font-extrabold tracking-wide text-white">SiteFlow</p>
            <p className="text-[10px] uppercase tracking-widest text-slate-400">Site Management</p>
          </div>
        </div>
        <div className="h-[calc(100vh-4rem)] overflow-y-auto px-3 py-4">
          <NavLinks />
          <div className="mt-8 rounded-xl bg-slate-800/70 p-3">
            <p className="text-xs font-semibold text-white">{user?.name}</p>
            <p className="mt-0.5 text-[11px] text-slate-400">{user?.email}</p>
            <span className="mt-2 inline-block rounded-full bg-brand-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-300">
              {role}
            </span>
          </div>
        </div>
      </aside>

      {/* Mobile backdrop */}
      {open && <div className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden" onClick={() => setOpen(false)} />}

      {/* Main column */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
              ☰
            </button>
            <div>
              <h1 className="text-lg font-bold text-slate-900">{title}</h1>
              {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="btn-outline !px-3 !py-1.5 text-xs"
              title={`Signed in as ${user?.email}`}
            >
              Sign out
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}

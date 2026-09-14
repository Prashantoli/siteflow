import { useState } from "react";
import { GetServerSidePropsContext } from "next";
import { getServerSession } from "next-auth";
import { signIn } from "next-auth/react";
import { authOptions } from "@/lib/auth";
import { homeFor } from "@/lib/rbac";

export default function LoginPage() {
  const [email, setEmail] = useState("admin@siteflow.com");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError("Invalid email or password");
      return;
    }
    // fetch role by hitting a cheap authenticated endpoint via session
    const sessionRes = await fetch("/api/auth/session");
    const session = await sessionRes.json();
    window.location.href = homeFor(session?.user?.role ?? "EMPLOYEE");
  }

  const quick = [
    { label: "Admin", email: "admin@siteflow.com", desc: "Full control" },
    { label: "Site Manager", email: "manager@siteflow.com", desc: "Operations" },
    { label: "Worker", email: "worker@siteflow.com", desc: "Field access" },
  ];

  return (
    <div className="flex min-h-screen">
      {/* Left brand panel */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-slate-900 p-10 text-white lg:flex">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "repeating-linear-gradient(45deg, #f59e0b 0 2px, transparent 2px 24px)" }} />
        <div className="relative">
          <p className="text-3xl font-extrabold">🏗️ SiteFlow</p>
          <p className="mt-2 text-slate-300">Construction Site Management System</p>
        </div>
        <div className="relative space-y-4">
          <h2 className="text-3xl font-bold leading-snug">
            One platform for every site,
            <br /> every crew, every task.
          </h2>
          <ul className="space-y-2 text-slate-300">
            <li>✅ Digital task assignment & live status tracking</li>
            <li>📍 Geofenced check-in/out & live workforce location</li>
            <li>🔔 Automated schedule, location & deadline alerts</li>
            <li>💰 Invoicing, payments & payroll-ready reporting</li>
          </ul>
        </div>
        <p className="relative text-xs text-slate-500">Replaces spreadsheets, WhatsApp groups and paper attendance sheets.</p>
      </div>

      {/* Right form */}
      <div className="flex w-full items-center justify-center bg-slate-100 p-6 lg:w-1/2">
        <div className="w-full max-w-md">
          <div className="card p-8">
            <h1 className="text-xl font-extrabold text-slate-900">Sign in</h1>
            <p className="mt-1 text-sm text-slate-500">Use your work account to continue.</p>

            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <label className="label">Email</label>
                <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div>
                <label className="label">Password</label>
                <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
              <button className="btn-primary w-full" disabled={loading}>
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {quick.map((q) => (
              <button
                key={q.email}
                onClick={() => {
                  setEmail(q.email);
                  setPassword("password123");
                }}
                className="card p-3 text-left transition hover:border-brand-400"
              >
                <p className="text-xs font-bold text-slate-800">{q.label}</p>
                <p className="mt-0.5 text-[10px] text-slate-500">{q.desc}</p>
              </button>
            ))}
          </div>
          <p className="mt-3 text-center text-xs text-slate-400">Demo password for all accounts: password123</p>
        </div>
      </div>
    </div>
  );
}

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  if (session) {
    return { redirect: { destination: homeFor(session.user.role), permanent: false } };
  }
  return { props: {} };
}

import { GetServerSidePropsContext } from "next";
import { getSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { homeFor } from "@/lib/rbac";
import { CURRENCIES } from "@/lib/currency";

type Settings = Record<string, string>;
type SmtpStatus = {
  host: string; port: number; secure: boolean; user: string; from: string;
  enabled: boolean; source: "db" | "env" | "none"; pass: string;
};

const SMTP_MASK = "••••••••";

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({});
  const [smtpStatus, setSmtpStatus] = useState<SmtpStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/settings").then((r) => r.ok ? r.json() : null).then((d) => {
      if (!d) return;
      setSettings(d.settings);
      setSmtpStatus(d.smtp);
      if (d.settings["smtp.pass"]) {
        setSettings((s) => ({ ...s, "smtp.pass": SMTP_MASK }));
      }
    });
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const payload = { ...settings };
    if (payload["smtp.pass"] === SMTP_MASK) delete payload["smtp.pass"];
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    setMsg(res.ok ? "Settings saved ✔" : "Failed to save settings");
    if (res.ok) {
      const d = await res.json();
      setSmtpStatus(d.smtp);
    }
  }

  async function verify() {
    setVerifying(true);
    setVerifyMsg(null);
    // save first so the server tests the latest values
    const payload = { ...settings };
    if (payload["smtp.pass"] === SMTP_MASK) delete payload["smtp.pass"];
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const res = await fetch("/api/settings/smtp/verify", { method: "POST" });
    const d = await res.json();
    setVerifying(false);
    setVerifyMsg({ ok: !!d.ok, text: d.ok ? "SMTP connection verified ✔" : `Verification failed: ${d.error ?? "unknown error"}` });
  }

  async function sendTest() {
    if (!testTo) return;
    setTesting(true);
    setTestMsg(null);
    const res = await fetch("/api/settings/smtp/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: testTo }),
    });
    const d = await res.json();
    setTesting(false);
    setTestMsg({
      ok: d.status === "sent",
      text: d.status === "sent"
        ? `Test email sent via ${d.channel} ✔`
        : `Send failed: ${d.error ?? d.status}`,
    });
  }

  const field = (key: string, label: string, opts?: { type?: string; placeholder?: string }) => (
    <div>
      <label className="label">{label}</label>
      <input
        className="input"
        type={opts?.type ?? "text"}
        placeholder={opts?.placeholder}
        value={settings[key] ?? ""}
        onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
      />
    </div>
  );

  return (
    <Shell title="System Settings" subtitle="Company profile, billing, notifications and email (SMTP)">
      <form onSubmit={save} className="space-y-6">
        <div className="card p-5">
          <h3 className="text-sm font-bold text-slate-800">Company Profile</h3>
          <p className="mt-0.5 text-xs text-slate-500">Shown on invoices and notifications.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {field("company.name", "Company name")}
            {field("company.email", "Billing email")}
            {field("company.phone", "Phone")}
            {field("company.address", "Address")}
          </div>
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-bold text-slate-800">Billing & Currency</h3>
          <p className="mt-0.5 text-xs text-slate-500">Default currency used across invoices, BOQ, purchase and sales orders.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Currency</label>
              <select
                className="input"
                value={settings["billing.currency"] ?? "NPR"}
                onChange={(e) => setSettings({ ...settings, "billing.currency": e.target.value })}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.code} — {c.name} ({c.symbol.trim()})</option>
                ))}
              </select>
            </div>
            {field("billing.defaultTaxPercent", "Default tax / VAT %", { type: "number" })}
          </div>
        </div>

        {/* SMTP / Email */}
        <div className="card p-5">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Email — SMTP</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Configure your own mail server (Gmail, Outlook, cPanel, Mailgun…). Used for task alerts, shift reminders and payment notices.
              </p>
            </div>
            {smtpStatus && (
              <span className={`badge ${smtpStatus.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                {smtpStatus.source === "db" ? "configured here" : smtpStatus.source === "env" ? "from .env" : "not configured"}
              </span>
            )}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Enabled</label>
              <select
                className="input"
                value={settings["smtp.enabled"] ?? "true"}
                onChange={(e) => setSettings({ ...settings, "smtp.enabled": e.target.value })}
              >
                <option value="true">Enabled — send email via SMTP</option>
                <option value="false">Disabled — fall back to Resend API / skip</option>
              </select>
            </div>
            {field("smtp.host", "SMTP host", { placeholder: "smtp.gmail.com" })}
            {field("smtp.port", "Port", { type: "number", placeholder: "587" })}
            <div>
              <label className="label">Encryption</label>
              <select
                className="input"
                value={settings["smtp.secure"] ?? "false"}
                onChange={(e) => setSettings({ ...settings, "smtp.secure": e.target.value })}
              >
                <option value="false">STARTTLS / none (port 587)</option>
                <option value="true">SSL/TLS (port 465)</option>
              </select>
            </div>
            {field("smtp.user", "Username", { placeholder: "notifications@yourcompany.com" })}
            <div>
              <label className="label">Password / app password</label>
              <input
                className="input"
                type="password"
                placeholder={settings["smtp.pass"] ? "leave blank to keep current" : "app password"}
                value={settings["smtp.pass"] === SMTP_MASK ? "" : settings["smtp.pass"] ?? ""}
                onChange={(e) => setSettings({ ...settings, "smtp.pass": e.target.value })}
              />
              {settings["smtp.pass"] === SMTP_MASK && (
                <p className="mt-1 text-[11px] text-slate-400">A password is saved. Type a new one to replace it.</p>
              )}
            </div>
            {field("smtp.from", "From address", { placeholder: "SiteFlow <notifications@yourcompany.com>" })}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" className="btn-outline" onClick={verify} disabled={verifying}>
              {verifying ? "Verifying…" : "🔌 Verify connection"}
            </button>
            <div className="flex items-center gap-1">
              <input
                className="input !w-56"
                type="email"
                placeholder="send test to…"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
              />
              <button type="button" className="btn-outline" onClick={sendTest} disabled={testing || !testTo}>
                {testing ? "Sending…" : "✉ Send test"}
              </button>
            </div>
          </div>
          {verifyMsg && (
            <p className={`mt-2 rounded-lg px-3 py-2 text-sm ${verifyMsg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{verifyMsg.text}</p>
          )}
          {testMsg && (
            <p className={`mt-2 rounded-lg px-3 py-2 text-sm ${testMsg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{testMsg.text}</p>
          )}

          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            <p className="font-semibold text-slate-700">Common provider presets</p>
            <p className="mt-1">Gmail: smtp.gmail.com · 587 · STARTTLS · username + <a className="underline" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">App Password</a></p>
            <p>Outlook: smtp-mail.outlook.com · 587 · STARTTLS</p>
            <p>Mailgun: smtp.mailgun.org · 587 · postmaster@yourdomain</p>
            <p className="mt-1">Alternatively set <code className="rounded bg-slate-200 px-1">SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/EMAIL_FROM</code> in <code className="rounded bg-slate-200 px-1">.env</code> — values saved here take priority.</p>
            <p className="mt-1">No SMTP? The system automatically falls back to <code className="rounded bg-slate-200 px-1">RESEND_API_KEY</code> if present.</p>
          </div>
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-bold text-slate-800">Notifications</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Shift reminders are sent by the scheduler (Vercel cron or external cron hitting
            <code className="mx-1 rounded bg-slate-100 px-1">/api/cron/notifications</code> with
            <code className="mx-1 rounded bg-slate-100 px-1">Authorization: Bearer CRON_SECRET</code>).
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {field("notifications.reminderHours", "Remind workers X hours before shift", { type: "number" })}
          </div>
          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            <p className="font-semibold text-slate-700">SMS (optional)</p>
            <p className="mt-1">📱 Twilio — <code>TWILIO_ACCOUNT_SID</code>, <code>TWILIO_AUTH_TOKEN</code>, <code>TWILIO_FROM_NUMBER</code> in <code>.env</code>. Sent for urgent tasks and schedule alerts.</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          {msg && <span className={`text-sm font-medium ${msg.includes("✔") ? "text-emerald-600" : "text-red-600"}`}>{msg}</span>}
          <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save settings"}</button>
        </div>
      </form>
    </Shell>
  );
}

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
  const session = await getSession(ctx);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  if (session.user.role !== "ADMIN") return { redirect: { destination: homeFor(session.user.role), permanent: false } };
  return { props: {} };
}

import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";

export type MailChannel = "smtp" | "resend" | "none";

export type EmailSendResult = {
  channel: MailChannel;
  status: "sent" | "skipped" | "failed";
  error?: string;
};

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  enabled: boolean;
  source: "db" | "env" | "none";
};

/** DB keys used for runtime SMTP configuration (admin Settings page). */
export const SMTP_DB_KEYS = {
  enabled: "smtp.enabled",
  host: "smtp.host",
  port: "smtp.port",
  secure: "smtp.secure",
  user: "smtp.user",
  pass: "smtp.pass",
  from: "smtp.from",
} as const;

type EnvSmtp = {
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  from?: string;
};

function envSmtpConfig(): EnvSmtp {
  const host = process.env.SMTP_HOST;
  if (!host) return {};
  const port = Number(process.env.SMTP_PORT || 587);
  return {
    host,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.EMAIL_FROM || "",
  };
}

function parseBool(v: string | undefined, dflt = false) {
  if (v === undefined) return dflt;
  return v === "true" || v === "1";
}

/**
 * Resolves the active SMTP configuration.
 * Priority: DB settings (admin Settings page) → env vars → none.
 * Password is never returned to clients unless includeSecret is true.
 */
export async function getSmtpConfig(includeSecret = false): Promise<SmtpConfig> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { startsWith: "smtp." } },
  });
  const db: Record<string, string> = {};
  for (const r of rows) db[r.key] = r.value;

  const env = envSmtpConfig();

  const host = db[SMTP_DB_KEYS.host] || env.host || "";
  const port = Number(db[SMTP_DB_KEYS.port] || env.port || 587);
  const secure = parseBool(db[SMTP_DB_KEYS.secure], port === 465);
  const user = db[SMTP_DB_KEYS.user] || env.user || "";
  const pass = db[SMTP_DB_KEYS.pass] || env.pass || "";
  const from = db[SMTP_DB_KEYS.from] || env.from || "";

  const hasConfig = !!host;
  const enabled = hasConfig && parseBool(db[SMTP_DB_KEYS.enabled], true);

  return {
    host,
    port,
    secure,
    user,
    pass: includeSecret ? pass : "",
    from,
    enabled,
    source: db[SMTP_DB_KEYS.host] ? "db" : env.host ? "env" : "none",
  };
}

/** Masked view safe to send to the client. */
export function maskSmtp(cfg: SmtpConfig) {
  return { ...cfg, pass: cfg.pass ? "••••••••" : "" };
}

function transporterFor(cfg: SmtpConfig) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
}

/**
 * Sends an email via SMTP (DB or env config). Resend API fallback when
 * SMTP is not configured. Returns a structured result; never throws.
 */
export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<EmailSendResult> {
  const cfg = await getSmtpConfig(true);

  if (cfg.enabled && cfg.host) {
    try {
      const transporter = transporterFor(cfg);
      await transporter.sendMail({
        from: cfg.from || cfg.user || "SiteFlow <no-reply@localhost>",
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
      });
      return { channel: "smtp", status: "sent" };
    } catch (e) {
      // fall through to Resend fallback
      const fallback = await sendViaResend(opts);
      return {
        ...fallback,
        error: `SMTP failed (${(e as Error).message}); ${fallback.channel === "resend" ? "delivered via Resend fallback" : "no fallback delivery"}`,
      };
    }
  }

  return sendViaResend(opts);
}

async function sendViaResend(opts: { to: string; subject: string; text: string; html?: string }): Promise<EmailSendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { channel: "none", status: "skipped", error: "No SMTP configured and no RESEND_API_KEY" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || "SiteFlow <onboarding@resend.dev>",
        to: [opts.to],
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { channel: "resend", status: "failed", error: `Resend ${res.status}: ${body.slice(0, 200)}` };
    }
    return { channel: "resend", status: "sent" };
  } catch (e) {
    return { channel: "resend", status: "failed", error: (e as Error).message };
  }
}

/** Verifies SMTP connectivity + auth without sending an email. */
export async function verifySmtp(): Promise<{ ok: boolean; error?: string }> {
  const cfg = await getSmtpConfig(true);
  if (!cfg.host) return { ok: false, error: "SMTP host is not configured" };
  try {
    await transporterFor(cfg).verify();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

const BRAND = "SiteFlow";
const styles = `
  body{font-family:system-ui,Segoe UI,Arial,sans-serif;color:#0f172a;margin:0;padding:24px;background:#f1f5f9}
  .card{max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0}
  .head{background:#0f172a;color:#fff;padding:16px 24px;font-weight:800;font-size:16px}
  .body{padding:24px}
  h1{font-size:18px;margin:0 0 8px}
  p{margin:0 0 12px;line-height:1.5;font-size:14px}
  .btn{display:inline-block;background:#d97706;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:700;font-size:14px;margin-top:8px}
  .foot{padding:16px 24px;background:#f8fafc;color:#64748b;font-size:12px}
`;

export function emailHtml(title: string, body: string, link?: string | null) {
  const btn = link ? `<a class="btn" href="${link}">Open in SiteFlow</a>` : "";
  return `<!doctype html><html><body><div class="card">
    <div class="head">🏗 ${BRAND}</div>
    <div class="body">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(body).replace(/\n/g, "<br/>")}</p>
      ${btn}
    </div>
    <div class="foot">Sent by SiteFlow — Construction Site Management System</div>
  </div></body></html>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

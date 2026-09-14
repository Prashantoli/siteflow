import { prisma } from "@/lib/prisma";
import { NotificationType } from "@prisma/client";

type ChannelResult = { inApp: boolean; email?: "sent" | "skipped" | "failed"; sms?: "sent" | "skipped" | "failed" };

/**
 * Creates an in-app notification and best-effort delivers email/SMS
 * using plain REST calls (no extra SDKs). Failures never throw —
 * notifications are not critical path.
 */
export async function notifyUser(opts: {
  userId: string;
  title: string;
  body: string;
  type?: NotificationType;
  link?: string;
  email?: boolean;
  sms?: boolean;
}): Promise<ChannelResult> {
  const user = await prisma.user.findUnique({ where: { id: opts.userId } });
  await prisma.notification.create({
    data: {
      userId: opts.userId,
      title: opts.title,
      body: opts.body,
      type: opts.type ?? "SYSTEM",
      link: opts.link ?? null,
    },
  });

  const result: ChannelResult = { inApp: true };

  if (opts.email && user?.email) {
    result.email = await sendEmail(user.email, opts.title, opts.body, opts.link ?? null);
  }
  if (opts.sms && user?.phone) {
    result.sms = await sendSms(user.phone, `${opts.title}\n${opts.body}`);
  }
  return result;
}

export async function notifyMany(userIds: string[], opts: Omit<Parameters<typeof notifyUser>[0], "userId">) {
  await Promise.allSettled(userIds.map((userId) => notifyUser({ ...opts, userId })));
}

// ---------------- Email (SMTP via lib/mail, Resend fallback) ----------------
import { sendMail, emailHtml } from "@/lib/mail";

export async function sendEmail(to: string, subject: string, text: string, link?: string | null): Promise<"sent" | "skipped" | "failed"> {
  const result = await sendMail({ to, subject, text, html: emailHtml(subject, text, link) });
  if (result.status === "failed") console.warn("[mail] delivery failed:", result.error);
  return result.status;
}

// ---------------- SMS (Twilio REST API) ----------------
export async function sendSms(to: string, body: string): Promise<"sent" | "skipped" | "failed"> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) return "skipped";
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    });
    return res.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}

// ---------------- Message templates ----------------
export const templates = {
  taskAssigned: (taskTitle: string, siteName: string, due: Date) => ({
    title: "New task assigned",
    body: `${taskTitle} at ${siteName} — due ${due.toLocaleDateString()}`,
    type: "TASK_ASSIGNED" as NotificationType,
    link: "/portal/my-day",
  }),
  shiftReminder: (siteName: string, when: Date) => ({
    title: "Shift reminder",
    body: `Your shift at ${siteName} starts ${when.toLocaleString()}`,
    type: "REMINDER" as NotificationType,
    link: "/portal/my-day",
  }),
  locationAlert: (siteName: string, address: string) => ({
    title: "Work location",
    body: `You are assigned at ${siteName} — ${address}`,
    type: "LOCATION" as NotificationType,
    link: "/portal/my-day",
  }),
  scheduleAlert: (siteName: string, start: Date, end: Date) => ({
    title: "Schedule update",
    body: `Shift at ${siteName}: ${start.toLocaleTimeString()} – ${end.toLocaleTimeString()}`,
    type: "SCHEDULE" as NotificationType,
    link: "/portal/my-day",
  }),
};

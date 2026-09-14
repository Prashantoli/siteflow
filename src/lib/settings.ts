import { prisma } from "@/lib/prisma";

export type AppSettings = {
  "company.name": string;
  "company.email": string;
  "company.phone": string;
  "company.address": string;
  "billing.defaultTaxPercent": string;
  "billing.currency": string;
  "notifications.reminderHours": string;
  "smtp.enabled": string;
  "smtp.host": string;
  "smtp.port": string;
  "smtp.secure": string;
  "smtp.user": string;
  "smtp.pass": string;
  "smtp.from": string;
};

export const SMTP_KEYS = [
  "smtp.enabled",
  "smtp.host",
  "smtp.port",
  "smtp.secure",
  "smtp.user",
  "smtp.pass",
  "smtp.from",
] as const;

export const SMTP_MASK = "••••••••";

export const SETTING_KEYS: (keyof AppSettings)[] = [
  "company.name",
  "company.email",
  "company.phone",
  "company.address",
  "billing.defaultTaxPercent",
  "billing.currency",
  "notifications.reminderHours",
  ...SMTP_KEYS,
];

export async function getSettings(): Promise<Record<string, string>> {
  const rows = await prisma.appSetting.findMany();
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return map;
}

export async function getCompany() {
  const s = await getSettings();
  return {
    name: s["company.name"] || "SiteFlow Constructions",
    email: s["company.email"] || "",
    phone: s["company.phone"] || "",
    address: s["company.address"] || "",
    currency: s["billing.currency"] || "NPR",
  };
}

export async function setSettings(entries: Record<string, string>) {
  const ops = Object.entries(entries).map(([key, value]) =>
    prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } })
  );
  await prisma.$transaction(ops);
}

import NepaliDate from "nepali-date-converter";

/** Nepal Standard Time offset: UTC+05:45 */
export const NPT_OFFSET_MIN = 5 * 60 + 45;

export const BS_MONTHS = [
  "Baisakh", "Jestha", "Ashad", "Shrawan", "Bhadra", "Ashoj",
  "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra",
];
const AD_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Shift an instant into the NPT wall clock. The shifted Date's *UTC fields*
 * represent Nepal local time, so format from UTC fields (tz-independent).
 */
export function toNpt(d: Date | string | number): Date {
  return new Date(new Date(d).getTime() + NPT_OFFSET_MIN * 60_000);
}

/** YYYY-MM-DD of the NPT calendar day. */
export function nptDateKey(d: Date | string | number): string {
  return toNpt(d).toISOString().slice(0, 10);
}

function parts(shiftedIso: string) {
  return {
    y: +shiftedIso.slice(0, 4),
    m: +shiftedIso.slice(5, 7),
    d: +shiftedIso.slice(8, 10),
    hh: +shiftedIso.slice(11, 13),
    mm: +shiftedIso.slice(14, 16),
  };
}

/** "14 Sep 2026" in NPT (timezone-safe). */
export function formatAdShort(d: Date | string | number): string {
  const p = parts(toNpt(d).toISOString());
  return `${p.d} ${AD_MONTHS[p.m - 1]} ${p.y}`;
}

/** "4:15 PM" in NPT (timezone-safe). */
export function formatNptTime(d: Date | string | number): string {
  const p = parts(toNpt(d).toISOString());
  const am = p.hh < 12 ? "AM" : "PM";
  const h12 = p.hh % 12 || 12;
  return `${h12}:${String(p.mm).padStart(2, "0")} ${am}`;
}

export type BsDate = {
  year: number;
  month: number; // 1-indexed
  day: number;
  monthName: string;
  formatted: string; // "2083 Bhadra 29"
  weekday: string;
};

/**
 * Convert to Bikram Sambat. Builds the converter input at 12:00 UTC of the
 * NPT calendar day so the result is stable across server/browser timezones.
 */
export function toBs(d: Date | string | number): BsDate {
  const key = nptDateKey(d); // NPT calendar day
  const nd = new NepaliDate(new Date(`${key}T12:00:00Z`));
  const year = nd.getYear();
  const month0 = nd.getMonth();
  const day = nd.getDate();
  return {
    year,
    month: month0 + 1,
    day,
    monthName: BS_MONTHS[month0] ?? "",
    formatted: `${year} ${BS_MONTHS[month0] ?? ""} ${day}`,
    weekday: nd.format("ddd"),
  };
}

/** "2083 Bhadra 29" */
export function formatBs(d: Date | string | number): string {
  try {
    return toBs(d).formatted;
  } catch {
    return "";
  }
}

/** "2083/05/29 BS" */
export function formatBsNumeric(d: Date | string | number): string {
  try {
    const b = toBs(d);
    return `${b.year}/${String(b.month).padStart(2, "0")}/${String(b.day).padStart(2, "0")} BS`;
  } catch {
    return "";
  }
}

/** Dual date: "2083 Bhadra 29 (14 Sep 2026)" — BS first, AD in NPT. */
export function formatDual(d: Date | string | number): string {
  const bs = formatBs(d);
  const ad = formatAdShort(d);
  return bs ? `${bs} (${ad})` : ad;
}

/** "14 Sep 2026, 4:15 PM NPT · 2083 Bhadra 29" */
export function formatDualDateTime(d: Date | string | number): string {
  return `${formatAdShort(d)}, ${formatNptTime(d)} NPT · ${formatBs(d)}`;
}

/** Today in Nepal: { ad: "2026-09-14", bs: "2083 Bhadra 29", weekday } */
export function todayNepal() {
  const now = new Date();
  const b = toBs(now);
  return { ad: nptDateKey(now), bs: b.formatted, bsNumeric: formatBsNumeric(now), weekday: b.weekday };
}

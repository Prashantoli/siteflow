/**
 * Dual-calendar date picker: pick dates in the Nepali (Bikram Sambat) or
 * English (Gregorian) calendar from the same field. The stored value is always
 * an ISO AD date string (YYYY-MM-DD); the picker just offers two views.
 *
 * Features
 *  - Toggle AD ⇄ BS with one tap (remembers your choice per browser).
 *  - BS view: real BS month grid from the nepali-date-converter data tables,
 *    with BS year/month selectors and both calendars shown on every cell.
 *  - AD view: native browser date input plus a live BS equivalent underneath.
 *  - Saturday = first day of the week (Nepal convention).
 *  - Opens anchored to the selected date, or today (NPT) when empty.
 */
import { useEffect, useMemo, useState } from "react";
import NepaliDate from "nepali-date-converter";
import { toBs, BS_MONTHS, toNpt } from "@/lib/nepal";

// toJsDate() returns the AD instant at NPT-midnight (18:15Z of the previous
// AD day), so every calendar-day extraction must go through toNpt().

const BS_MONTHS_NP = [
  "बैशाख", "जेठ", "असार", "साउन", "भदौ", "असोज",
  "कार्तिक", "मंसिर", "पुष", "माघ", "फागुन", "चैत",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Nepal week starts on Saturday (JS Sunday=0; reorder Sat first). */
const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5];

/** ISO calendar day of an instant in Nepal time (UTC+5:45). */
const isoDay = (d: Date) => toNpt(d).toISOString().slice(0, 10);

/** Number of days in a BS month using the package's data tables. */
function bsMonthLength(year: number, month0: number): number {
  const anchor = new NepaliDate(year, month0, 1);
  const next =
    month0 === 11 ? new NepaliDate(year + 1, 0, 1) : new NepaliDate(year, month0 + 1, 1);
  return Math.round((next.toJsDate().getTime() - anchor.toJsDate().getTime()) / 86_400_000);
}

export default function DualDatePicker({
  value,
  onChange,
  label,
  required = false,
  className = "",
  min,
  max,
}: {
  value: string; // ISO AD "YYYY-MM-DD" or ""
  onChange: (isoAd: string) => void;
  label?: string;
  required?: boolean;
  className?: string;
  min?: string;
  max?: string;
}) {
  const [mode, setMode] = useState<"AD" | "BS">("AD");
  const [open, setOpen] = useState(false);

  // BS navigation state — null until first opened
  const [bsY, setBsY] = useState<number | null>(null);
  const [bsM, setBsM] = useState<number | null>(null); // 0-indexed

  useEffect(() => {
    const saved = window.localStorage.getItem("siteflow.calendar");
    if (saved === "BS" || saved === "AD") setMode(saved);
  }, []);

  const switchMode = (m: "AD" | "BS") => {
    setMode(m);
    window.localStorage.setItem("siteflow.calendar", m);
    // Toggling to BS opens the calendar right away; AD uses the native picker.
    setOpen(m === "BS");
  };

  const selectedBs = useMemo(() => {
    try {
      return value ? toBs(`${value}T12:00:00Z`) : null;
    } catch {
      return null;
    }
  }, [value]);

  // Anchor the BS grid: to the selected date, or today (NPT) when empty.
  // This runs on every open so the grid is ALWAYS ready before the popup renders.
  useEffect(() => {
    if (!open || mode !== "BS") return;
    if (bsY !== null && bsM !== null && selectedBs) return; // already anchored to a date
    const t = selectedBs ?? toBs(new Date());
    setBsY(t.year);
    setBsM(t.month - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, selectedBs?.year, selectedBs?.month]);

  const todayIso = isoDay(new Date()); // today in Nepal

  const grid = useMemo(() => {
    if (mode !== "BS" || bsY === null || bsM === null) return null;
    let days = 30;
    try {
      days = bsMonthLength(bsY, bsM);
    } catch {
      return null;
    }
    // Weekday of BS day 1 (shifted to the NPT wall clock for UTC fields).
    const first = new NepaliDate(bsY, bsM, 1).toJsDate();
    const startDow = toNpt(first).getUTCDay();
    const cells: ({ ad: string; d: number } | null)[] = Array(startDow).fill(null);
    for (let d = 1; d <= days; d++) {
      const ad = new NepaliDate(bsY, bsM, d).toJsDate();
      cells.push({ ad: isoDay(ad), d });
    }
    return cells;
  }, [mode, bsY, bsM]);

  const years = useMemo(() => {
    const base = (selectedBs ?? toBs(new Date())).year;
    const list: number[] = [];
    for (let y = base - 15; y <= base + 15; y++) list.push(y);
    return list;
  }, [selectedBs?.year, value]);

  const prevMonth = () => {
    if (bsY === null || bsM === null) return;
    if (bsM === 0) {
      setBsY(bsY - 1);
      setBsM(11);
    } else setBsM(bsM - 1);
  };
  const nextMonth = () => {
    if (bsY === null || bsM === null) return;
    if (bsM === 11) {
      setBsY(bsY + 1);
      setBsM(0);
    } else setBsM(bsM + 1);
  };

  const showPopup = open && mode === "BS" && bsY !== null && bsM !== null && grid !== null;

  return (
    <div className={`relative ${className}`}>
      {label ? <label className="label">{label}</label> : null}
      <div className="flex items-center gap-2">
        <input
          className="input min-w-0 flex-1 cursor-pointer"
          type={mode === "AD" ? "date" : "text"}
          readOnly={mode === "BS"}
          placeholder={mode === "BS" ? "Pick a date (BS)" : ""}
          value={mode === "AD" ? value : selectedBs ? selectedBs.formatted : ""}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          min={min}
          max={max}
        />
        <div className="flex rounded-lg border border-slate-300 overflow-hidden shrink-0">
          <button
            type="button"
            onClick={() => switchMode("AD")}
            className={`px-2.5 py-1.5 text-xs font-semibold ${mode === "AD" ? "bg-amber-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
            title="English calendar (Gregorian)"
          >
            AD
          </button>
          <button
            type="button"
            onClick={() => switchMode("BS")}
            className={`px-2.5 py-1.5 text-xs font-semibold ${mode === "BS" ? "bg-amber-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
            title="Nepali calendar (Bikram Sambat)"
          >
            BS
          </button>
        </div>
      </div>

      {/* Always show the equivalent date in the other calendar */}
      <div className="text-[11px] text-slate-500 mt-1">
        {selectedBs ? (
          mode === "AD" ? (
            <>BS: <span className="font-semibold text-slate-700">{selectedBs.formatted}</span> ({BS_MONTHS_NP[selectedBs.month - 1]} {selectedBs.day})</>
          ) : (
            <>AD: <span className="font-semibold text-slate-700">{value}</span></>
          )
        ) : (
          <>Pick a date — switch between English (AD) and Nepali (BS) calendars</>
        )}
      </div>

      {showPopup ? (
        <>
          {/* click-away layer sits under the popup */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-2 w-72 rounded-xl border border-slate-200 bg-white shadow-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <button type="button" onClick={prevMonth} className="px-2 py-1 rounded hover:bg-slate-100 text-slate-600">‹</button>
              <div className="flex items-center gap-1">
                <select
                  className="input !w-auto !py-1 text-sm"
                  value={bsM}
                  onChange={(e) => setBsM(+e.target.value)}
                >
                  {BS_MONTHS.map((m: string, i: number) => (
                    <option key={i} value={i}>{m} · {BS_MONTHS_NP[i]}</option>
                  ))}
                </select>
                <select
                  className="input !w-auto !py-1 text-sm"
                  value={bsY}
                  onChange={(e) => setBsY(+e.target.value)}
                >
                  {years.map((y) => <option key={y} value={y}>{y} BS</option>)}
                </select>
              </div>
              <button type="button" onClick={nextMonth} className="px-2 py-1 rounded hover:bg-slate-100 text-slate-600">›</button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-bold text-slate-400 mb-1">
              {WEEK_ORDER.map((w) => <div key={w}>{WEEKDAYS[w]}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {grid!.map((cell, i) =>
                cell === null ? (
                  <div key={`e${i}`} />
                ) : (
                  <button
                    key={cell.ad}
                    type="button"
                    onClick={() => {
                      onChange(cell.ad);
                      setOpen(false);
                    }}
                    className={`py-1 rounded text-center leading-tight ${
                      value === cell.ad
                        ? "bg-amber-600 text-white"
                        : cell.ad === todayIso
                          ? "bg-amber-50 text-amber-800 font-bold"
                          : "hover:bg-slate-100 text-slate-700"
                    }`}
                  >
                    <div className="text-sm font-semibold">{cell.d}</div>
                    <div className="text-[9px] opacity-70">{cell.ad.slice(8, 10)}/{cell.ad.slice(5, 7)}</div>
                  </button>
                )
              )}
            </div>
            <div className="flex justify-between mt-2 pt-2 border-t border-slate-100">
              <button type="button" className="text-xs text-slate-500 hover:text-amber-700" onClick={() => { onChange(todayIso); setOpen(false); }}>
                Today
              </button>
              <button type="button" className="text-xs text-slate-500 hover:text-amber-700" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

export type CurrencyMeta = {
  code: string;
  symbol: string;
  name: string;
  grouping: "lakh" | "western";
  decimals: number;
};

/** Supported currencies. NPR first — the default for Nepal-based businesses. */
export const CURRENCIES: CurrencyMeta[] = [
  { code: "NPR", symbol: "Rs.", name: "Nepalese Rupee (रू)", grouping: "lakh", decimals: 2 },
  { code: "USD", symbol: "$", name: "US Dollar", grouping: "western", decimals: 2 },
  { code: "INR", symbol: "₹", name: "Indian Rupee", grouping: "lakh", decimals: 2 },
  { code: "EUR", symbol: "€", name: "Euro", grouping: "western", decimals: 2 },
  { code: "GBP", symbol: "£", name: "British Pound", grouping: "western", decimals: 2 },
  { code: "AUD", symbol: "A$", name: "Australian Dollar", grouping: "western", decimals: 2 },
  { code: "AED", symbol: "AED ", name: "UAE Dirham", grouping: "western", decimals: 2 },
  { code: "SAR", symbol: "SAR ", name: "Saudi Riyal", grouping: "western", decimals: 2 },
  { code: "QAR", symbol: "QAR ", name: "Qatari Riyal", grouping: "western", decimals: 2 },
  { code: "CNY", symbol: "¥", name: "Chinese Yuan", grouping: "western", decimals: 2 },
  { code: "JPY", symbol: "¥", name: "Japanese Yen", grouping: "western", decimals: 0 },
];

export function currencyMeta(code: string): CurrencyMeta {
  return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];
}

export function currencySymbol(code: string): string {
  return currencyMeta(code).symbol;
}

/** Format an amount: lakh-style grouping for NPR/INR, western otherwise. */
export function formatMoney(n: number, code = "NPR", decimals?: number): string {
  const meta = currencyMeta(code);
  const d = decimals ?? meta.decimals;
  const locale = meta.grouping === "lakh" ? "en-IN" : "en-US";
  const str = (Number.isFinite(n) ? n : 0).toLocaleString(locale, {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
  return `${meta.symbol}${str}`;
}

/** Compact for dashboards: Rs. 12.5k / $1.2M */
export function formatMoneyCompact(n: number, code = "NPR"): string {
  const sym = currencySymbol(code);
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${sym}${(n / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sym}${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sym}${(n / 1_000).toFixed(1)}k`;
  return formatMoney(n, code);
}

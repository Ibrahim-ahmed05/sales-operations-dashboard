const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** PKR 4.28B / PKR 12.4M / PKR 485K */
export function currency(value: number, opts: { withSymbol?: boolean } = {}): string {
  const symbol = opts.withSymbol === false ? "" : "PKR ";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}${symbol}${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}${symbol}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${symbol}${(abs / 1_000).toFixed(0)}K`;
  return `${sign}${symbol}${abs.toFixed(0)}`;
}

export function currencyExact(value: number): string {
  return `PKR ${Math.round(value).toLocaleString("en-US")}`;
}

export function compactNumber(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

export function percent(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

export function signedPercent(value: number, digits = 1): string {
  const s = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${s}${Math.abs(value).toFixed(digits)}%`;
}

/** "2026-08" -> "Aug 2026"; short -> "Aug '26" */
export function monthLabel(key: string, short = false): string {
  const y = key.slice(0, 4);
  const m = key.slice(5, 7);
  const label = MONTH_LABELS[Number(m) - 1] ?? m;
  return short ? `${label} '${y.slice(2)}` : `${label} ${y}`;
}

export function dateLabel(iso: string): string {
  if (!iso) return "—";
  const y = iso.slice(0, 4);
  const m = iso.slice(5, 7);
  const d = iso.slice(8, 10);
  return `${Number(d)} ${MONTH_LABELS[Number(m) - 1] ?? m} ${y}`;
}

export function deltaPct(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

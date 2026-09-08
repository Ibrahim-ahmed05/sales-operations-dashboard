import {
  dataset,
  CANCELLED,
  type InventoryRow,
  type InvoiceRow,
  type OrderRow,
} from "@/lib/dataset";

/**
 * Central analytics layer. Every figure rendered in the UI is derived here
 * from the transactional records, so this module can later be swapped for a
 * REST/API-backed implementation without touching components.
 */

export interface MonthRange {
  from: string; // "2025-03"
  to: string; // "2026-08"
}

export const ALL_MONTHS = dataset.months;
export const FULL_RANGE: MonthRange = {
  from: ALL_MONTHS[0] ?? "2025-03",
  to: ALL_MONTHS[ALL_MONTHS.length - 1] ?? "2026-08",
};

export function monthsInRange(range: MonthRange): string[] {
  return ALL_MONTHS.filter((m) => m >= range.from && m <= range.to);
}

/** Equal-length period immediately preceding the given range. */
export function previousRange(range: MonthRange): MonthRange | null {
  const inRange = monthsInRange(range);
  const startIdx = ALL_MONTHS.indexOf(inRange[0] ?? "");
  if (startIdx < inRange.length) return null;
  const prevEnd = startIdx - 1;
  const prevStart = Math.max(0, prevEnd - (inRange.length - 1));
  return { from: ALL_MONTHS[prevStart]!, to: ALL_MONTHS[prevEnd]! };
}

export interface MonthPoint {
  month: string;
  netSales: number;
  grossSales: number;
  returns: number;
  grossProfit: number;
  orders: number;
  onTime: number;
  delivered: number;
  delayed: number;
  avgLead: number;
}

const roundTo = (v: number) => Math.round(v * 100) / 100;

/** Gross profit net of the margin carried by returned goods. */
function netProfit(o: OrderRow): number {
  if (!o.ret || !o.rev) return o.gp;
  return o.gp - o.ret * (o.gp / o.rev);
}

export function validOrders(range: MonthRange): OrderRow[] {
  return dataset.orders.filter((o) => o.st !== CANCELLED && o.m >= range.from && o.m <= range.to);
}

export function ordersInRange(range: MonthRange): OrderRow[] {
  return dataset.orders.filter((o) => o.m >= range.from && o.m <= range.to);
}

export function monthlySeries(range: MonthRange): MonthPoint[] {
  const months = monthsInRange(range);
  const base = new Map<string, MonthPoint>(
    months.map((m) => [
      m,
      {
        month: m,
        netSales: 0,
        grossSales: 0,
        returns: 0,
        grossProfit: 0,
        orders: 0,
        onTime: 0,
        delivered: 0,
        delayed: 0,
        avgLead: 0,
      },
    ]),
  );
  const leadAcc = new Map<string, { sum: number; n: number }>();

  for (const o of dataset.orders) {
    const p = base.get(o.m);
    if (!p) continue;
    if (o.st !== CANCELLED) {
      p.grossSales += o.rev;
      p.returns += o.ret;
      p.netSales += o.rev - o.ret;
      p.grossProfit += netProfit(o);
      p.orders += 1;
    }
    if (o.ds === "On Time" || o.ds === "Delayed") {
      p.delivered += 1;
      if (o.ds === "On Time") p.onTime += 1;
      else p.delayed += 1;
      if (o.lead !== null) {
        const a = leadAcc.get(o.m) ?? { sum: 0, n: 0 };
        a.sum += o.lead;
        a.n += 1;
        leadAcc.set(o.m, a);
      }
    }
  }

  return months.map((m) => {
    const p = base.get(m)!;
    const a = leadAcc.get(m);
    return {
      ...p,
      netSales: roundTo(p.netSales),
      grossSales: roundTo(p.grossSales),
      grossProfit: roundTo(p.grossProfit),
      avgLead: a && a.n ? roundTo(a.sum / a.n) : 0,
    };
  });
}

export interface SalesTotals {
  grossSales: number;
  returns: number;
  netSales: number;
  grossProfit: number;
  marginPct: number;
  orders: number;
  aov: number;
  cancelled: number;
}

export function salesTotals(range: MonthRange): SalesTotals {
  const all = ordersInRange(range);
  const valid = all.filter((o) => o.st !== CANCELLED);
  const grossSales = valid.reduce((a, o) => a + o.rev, 0);
  const returns = valid.reduce((a, o) => a + o.ret, 0);
  const netSales = grossSales - returns;
  const grossProfit = valid.reduce((a, o) => a + netProfit(o), 0);
  return {
    grossSales,
    returns,
    netSales,
    grossProfit,
    marginPct: netSales ? (grossProfit / netSales) * 100 : 0,
    orders: valid.length,
    aov: valid.length ? netSales / valid.length : 0,
    cancelled: all.length - valid.length,
  };
}

export interface OpsTotals {
  delivered: number;
  onTime: number;
  delayed: number;
  onTimeRate: number;
  avgLead: number;
  avgDelay: number;
  overdueOpen: number;
}

export function opsTotals(range: MonthRange): OpsTotals {
  const orders = ordersInRange(range);
  const completed = orders.filter((o) => o.ds === "On Time" || o.ds === "Delayed");
  const onTime = completed.filter((o) => o.ds === "On Time").length;
  const delayed = completed.length - onTime;
  const leads = completed.filter((o) => o.lead !== null).map((o) => o.lead!);
  const delays = completed.filter((o) => o.ds === "Delayed").map((o) => o.delay);
  return {
    delivered: completed.length,
    onTime,
    delayed,
    onTimeRate: completed.length ? (onTime / completed.length) * 100 : 0,
    avgLead: leads.length ? leads.reduce((a, b) => a + b, 0) / leads.length : 0,
    avgDelay: delays.length ? delays.reduce((a, b) => a + b, 0) / delays.length : 0,
    overdueOpen: orders.filter((o) => o.overdueOpen).length,
  };
}

export type AgingBucket = "Current" | "Due Soon" | "Overdue";

export function agingOf(inv: InvoiceRow): AgingBucket | null {
  if (inv.out <= 0) return null;
  if (inv.overdueDays > 0) return "Overdue";
  if (inv.bucket === "Due Within 14 Days") return "Due Soon";
  return "Current";
}

export interface ReceivablesTotals {
  invoiced: number;
  collected: number;
  outstanding: number;
  current: number;
  dueSoon: number;
  overdue: number;
  overdueSharePct: number;
  atRiskSharePct: number;
  openInvoices: number;
  overdueInvoices: number;
  collectionRate: number;
  dso: number;
}

export function invoicesInRange(range: MonthRange): InvoiceRow[] {
  const orderIds = new Set(ordersInRange(range).map((o) => o.id));
  return dataset.invoices.filter((i) => orderIds.has(i.oid));
}

export function receivablesTotals(range: MonthRange): ReceivablesTotals {
  const invs = invoicesInRange(range);
  let invoiced = 0,
    collected = 0,
    current = 0,
    dueSoon = 0,
    overdue = 0,
    open = 0,
    overdueCount = 0;
  for (const i of invs) {
    invoiced += i.amt;
    collected += i.paid;
    const b = agingOf(i);
    if (!b) continue;
    open += 1;
    if (b === "Current") current += i.out;
    else if (b === "Due Soon") dueSoon += i.out;
    else {
      overdue += i.out;
      overdueCount += 1;
    }
  }
  const outstanding = current + dueSoon + overdue;
  return {
    invoiced,
    collected,
    outstanding,
    current,
    dueSoon,
    overdue,
    overdueSharePct: outstanding ? (overdue / outstanding) * 100 : 0,
    atRiskSharePct: outstanding ? ((overdue + dueSoon) / outstanding) * 100 : 0,
    openInvoices: open,
    overdueInvoices: overdueCount,
    collectionRate: invoiced ? (collected / invoiced) * 100 : 0,
    dso: invoiced ? (outstanding / invoiced) * 365 * (monthsInRange(range).length / 12) : 0,
  };
}

export interface InventoryTotals {
  products: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
  discrepancy: number;
  value: number;
  healthPct: number;
  attention: InventoryRow[];
}

export function inventoryTotals(): InventoryTotals {
  const rows = dataset.inventory;
  const count = (s: InventoryRow["state"]) => rows.filter((r) => r.state === s).length;
  const inStock = count("In Stock");
  const attention = rows
    .filter((r) => r.state !== "In Stock")
    .sort((a, b) => {
      const rank = { Discrepancy: 0, "Out of Stock": 1, "Low Stock": 2, "In Stock": 3 } as const;
      const d = rank[a.state] - rank[b.state];
      return d !== 0 ? d : a.avail - b.avail;
    });
  return {
    products: rows.length,
    inStock,
    lowStock: count("Low Stock"),
    outOfStock: count("Out of Stock"),
    discrepancy: count("Discrepancy"),
    value: rows.reduce((a, r) => a + r.value, 0),
    healthPct: rows.length ? (inStock / rows.length) * 100 : 0,
    attention,
  };
}

export interface RankRow {
  id: string;
  label: string;
  sub: string;
  value: number;
  share: number;
  deltaPct: number | null;
}

export function topCustomers(range: MonthRange, limit = 5): RankRow[] {
  const prev = previousRange(range);
  const agg = new Map<string, { name: string; value: number; orders: number }>();
  for (const o of validOrders(range)) {
    const a = agg.get(o.cid) ?? { name: o.cn, value: 0, orders: 0 };
    a.value += o.rev - o.ret;
    a.orders += 1;
    agg.set(o.cid, a);
  }
  const prevAgg = new Map<string, number>();
  if (prev) {
    for (const o of validOrders(prev)) {
      prevAgg.set(o.cid, (prevAgg.get(o.cid) ?? 0) + (o.rev - o.ret));
    }
  }
  const total = [...agg.values()].reduce((a, b) => a + b.value, 0);
  return [...agg.entries()]
    .sort((a, b) => b[1].value - a[1].value)
    .slice(0, limit)
    .map(([cid, a]) => {
      const p = prevAgg.get(cid) ?? 0;
      return {
        id: cid,
        label: a.name,
        sub: `${a.orders} orders`,
        value: a.value,
        share: total ? (a.value / total) * 100 : 0,
        deltaPct: p ? ((a.value - p) / p) * 100 : null,
      };
    });
}

export function topProducts(range: MonthRange, limit = 5): RankRow[] {
  const byId = new Map(dataset.products.map((p) => [p.pid, p]));
  const agg = new Map<string, { rev: number; qty: number; gp: number }>();
  for (const r of dataset.productMonthly) {
    if (r.m < range.from || r.m > range.to) continue;
    const a = agg.get(r.pid) ?? { rev: 0, qty: 0, gp: 0 };
    a.rev += r.rev;
    a.qty += r.qty;
    a.gp += r.gp;
    agg.set(r.pid, a);
  }
  const total = [...agg.values()].reduce((a, b) => a + b.rev, 0);
  return [...agg.entries()]
    .sort((a, b) => b[1].rev - a[1].rev)
    .slice(0, limit)
    .map(([pid, a]) => ({
      id: pid,
      label: byId.get(pid)?.name ?? pid,
      sub: `${byId.get(pid)?.category ?? ""} · ${Math.round(a.qty)} units`,
      value: a.rev,
      share: total ? (a.rev / total) * 100 : 0,
      deltaPct: a.rev ? (a.gp / a.rev) * 100 : null,
    }));
}

export function channelBreakdown(range: MonthRange) {
  const agg = new Map<string, { value: number; orders: number }>();
  for (const o of validOrders(range)) {
    const a = agg.get(o.ch) ?? { value: 0, orders: 0 };
    a.value += o.rev - o.ret;
    a.orders += 1;
    agg.set(o.ch, a);
  }
  const total = [...agg.values()].reduce((a, b) => a + b.value, 0);
  return [...agg.entries()]
    .map(([ch, a]) => ({ channel: ch, ...a, share: total ? (a.value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}

export function returnReasons(range: MonthRange) {
  const agg = new Map<string, { amount: number; count: number }>();
  for (const r of dataset.returns) {
    if (r.m < range.from || r.m > range.to) continue;
    const a = agg.get(r.reason) ?? { amount: 0, count: 0 };
    a.amount += r.amount;
    a.count += 1;
    agg.set(r.reason, a);
  }
  return [...agg.entries()]
    .map(([reason, a]) => ({ reason, ...a }))
    .sort((a, b) => b.amount - a.amount);
}

/** Compact overview bundle used by the executive dashboard. */
export function overviewMetrics(range: MonthRange) {
  const prev = previousRange(range);
  const sales = salesTotals(range);
  const prevSales = prev ? salesTotals(prev) : null;
  const ops = opsTotals(range);
  const prevOps = prev ? opsTotals(prev) : null;
  const receivables = receivablesTotals(range);
  const prevReceivables = prev ? receivablesTotals(prev) : null;
  const inventory = inventoryTotals();
  const series = monthlySeries(range);
  const prevSeries = prev ? monthlySeries(prev) : [];

  return {
    range,
    prev,
    sales,
    prevSales,
    ops,
    prevOps,
    receivables,
    prevReceivables,
    inventory,
    series,
    prevSeries,
  };
}

export type OverviewMetrics = ReturnType<typeof overviewMetrics>;

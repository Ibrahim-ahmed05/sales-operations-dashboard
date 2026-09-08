// One-time transform: CSV dataset -> compact JSON consumed by the app.
// Run: bun scripts/build-data.mjs /tmp/ds
import fs from "node:fs";
import path from "node:path";

const SRC = process.argv[2] || "/tmp/ds";
const OUT = path.resolve("src/data/dataset.json");

function parseCSV(file) {
  const text = fs.readFileSync(path.join(SRC, file), "utf8").replace(/\r/g, "");
  const rows = [];
  let cur = [""], q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur[cur.length - 1] += '"'; i++; } else q = false; }
      else cur[cur.length - 1] += c;
    } else if (c === '"') q = true;
    else if (c === ",") cur.push("");
    else if (c === "\n") { rows.push(cur); cur = [""]; }
    else cur[cur.length - 1] += c;
  }
  if (cur.length > 1 || cur[0] !== "") rows.push(cur);
  const head = rows.shift();
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

const n = (v) => { const x = parseFloat(v); return Number.isFinite(x) ? x : 0; };
const r2 = (x) => Math.round(x * 100) / 100;
const month = (d) => (d ? d.slice(0, 7) : "");

const customers = parseCSV("customers.csv");
const products = parseCSV("products.csv");
const orders = parseCSV("orders.csv");
const items = parseCSV("order_items.csv");
const returns = parseCSV("returns.csv");
const inventory = parseCSV("inventory.csv");
const receivables = parseCSV("receivables.csv");

const REFERENCE_DATE = "2026-09-01";

const custName = Object.fromEntries(customers.map((c) => [c.customer_id, c.customer_name]));
const prodById = Object.fromEntries(products.map((p) => [p.product_id, p]));

// ---- orders (cancelled excluded from sales downstream) ----
const returnsByOrder = {};
for (const rt of returns) {
  if (rt.return_status === "Cancelled" || rt.return_status === "Rejected") continue;
  returnsByOrder[rt.order_id] = (returnsByOrder[rt.order_id] || 0) + n(rt.refund_amount);
}

const orderRows = orders.map((o) => ({
  id: o.order_id,
  cid: o.customer_id,
  cn: custName[o.customer_id] || o.customer_id,
  d: o.order_date,
  m: month(o.order_date),
  st: o.order_status,
  ch: o.sales_channel,
  rev: r2(n(o.subtotal)),
  ret: r2(returnsByOrder[o.order_id] || 0),
  gp: r2(n(o.gross_profit)),
  ds: o.delivery_status,
  delay: n(o.delivery_delay_days),
  lead: o.delivery_lead_time_days === "" ? null : n(o.delivery_lead_time_days),
  overdueOpen: o.is_overdue_open_order === "True",
  total: r2(n(o.total_amount)),
}));

// ---- product monthly aggregation from order_items joined to valid orders ----
const orderMeta = Object.fromEntries(orderRows.map((o) => [o.id, o]));
const prodAgg = new Map(); // `${month}|${pid}` -> {rev, qty, profit}
for (const it of items) {
  const o = orderMeta[it.order_id];
  if (!o || o.st === "Cancelled") continue;
  const k = `${o.m}|${it.product_id}`;
  const a = prodAgg.get(k) || { m: o.m, pid: it.product_id, rev: 0, qty: 0, gp: 0 };
  a.rev += n(it.line_total);
  a.qty += n(it.quantity);
  a.gp += n(it.line_total) - n(it.line_cost);
  prodAgg.set(k, a);
}
const productMonthly = [...prodAgg.values()].map((a) => ({ ...a, rev: r2(a.rev), gp: r2(a.gp) }));

// ---- receivables ----
const invoiceRows = receivables.map((r) => ({
  id: r.invoice_id,
  oid: r.order_id,
  cid: r.customer_id,
  cn: custName[r.customer_id] || r.customer_id,
  date: r.invoice_date,
  m: month(r.invoice_date),
  due: r.due_date,
  amt: r2(n(r.invoice_amount)),
  paid: r2(n(r.amount_paid)),
  out: r2(n(r.outstanding_amount)),
  status: r.payment_status,
  overdueDays: n(r.days_overdue),
  bucket: r.aging_bucket,
}));

// ---- inventory joined products ----
const inventoryRows = inventory.map((i) => {
  const p = prodById[i.product_id] || {};
  const avail = n(i.quantity_available);
  const reorder = n(i.reorder_level);
  const state =
    avail < 0 ? "Discrepancy" : avail === 0 ? "Out of Stock" : avail <= reorder ? "Low Stock" : "In Stock";
  return {
    pid: i.product_id,
    sku: p.sku || "",
    name: p.product_name || i.product_id,
    category: p.category || "",
    warehouse: i.warehouse,
    onHand: n(i.quantity_on_hand),
    reserved: n(i.quantity_reserved),
    avail,
    reorder,
    preferred: n(i.preferred_stock_level),
    leadTime: n(p.supplier_lead_time_days),
    state,
    value: r2(n(i.inventory_value_at_cost)),
    unitPrice: n(p.unit_price),
    margin: n(p.gross_margin_pct),
  };
});

const productRows = products.map((p) => ({
  pid: p.product_id,
  sku: p.sku,
  name: p.product_name,
  category: p.category,
  price: n(p.unit_price),
  margin: n(p.gross_margin_pct),
}));

const customerRows = customers.map((c) => ({
  cid: c.customer_id,
  name: c.customer_name,
  industry: c.industry,
  city: c.city,
  segment: c.customer_segment,
  terms: n(c.payment_terms_days),
  creditLimit: n(c.credit_limit),
  status: c.account_status,
}));

const months = [...new Set(orderRows.map((o) => o.m).filter(Boolean))].sort();

const out = {
  referenceDate: REFERENCE_DATE,
  currency: "PKR",
  months,
  orders: orderRows,
  invoices: invoiceRows,
  inventory: inventoryRows,
  products: productRows,
  customers: customerRows,
  productMonthly,
  returns: returns.map((r) => ({
    id: r.return_id,
    oid: r.order_id,
    pid: r.product_id,
    m: month(r.return_date),
    date: r.return_date,
    qty: n(r.quantity_returned),
    reason: r.return_reason,
    amount: r2(n(r.refund_amount)),
    status: r.return_status,
  })),
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
console.log("wrote", OUT, (fs.statSync(OUT).size / 1024 / 1024).toFixed(2), "MB");
console.log("months", months[0], "->", months[months.length - 1], months.length);

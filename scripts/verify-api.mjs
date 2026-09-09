import assert from "node:assert/strict";
import { resolve } from "node:path";
import { DatabaseSync, backup } from "node:sqlite";
const sourceDb = new DatabaseSync(resolve("var/dashboard.sqlite"), { readOnly: true });
await backup(sourceDb, resolve("var/evaluation-test.sqlite"));
sourceDb.close();
process.env.DASHBOARD_DB = resolve("var/evaluation-test.sqlite");
const { handleApi } = await import("../server/api.mjs");
const { addUser, db } = await import("../server/db.mjs");
// Fixed figures independently verified with Decimal against the source CSVs.
const asOf = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Karachi",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const late = db
  .prepare("SELECT * FROM receivables")
  .all()
  .filter((i) => i.due_date < asOf && i.amount > i.paid);
const expected = {
  sales: 421516270000,
  orders: 2890,
  pending: 325,
  delivered: 2228,
  cancelled: 107,
  outstanding: 26106317700,
  overdue: late.reduce((a, i) => a + i.amount - i.paid, 0),
  overdueCount: late.length,
};
const origin = "http://localhost:8081";
const period = "from=2025-03-01&to=2026-08-31";
const password = "Generated-only-for-evaluation-9!";
const cookies = {};
for (const role of ["Admin", "Manager", "Viewer"]) {
  const email = role.toLowerCase() + "-" + Date.now() + "@test.local";
  addUser(email, role, role, password);
  const res = await handleApi(
    new Request(origin + "/api/auth/login", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ email, password, role: "Admin" }),
    }),
  );
  assert.equal(res.status, 200);
  assert.match(res.headers.get("set-cookie"), /HttpOnly; SameSite=Strict/);
  cookies[role] = res.headers.get("set-cookie").split(";")[0];
}
const request = async (path, role = "Manager") => {
  const res = await handleApi(
    new Request(origin + "/api/dashboard/" + path + (path.includes("?") ? "&" : "?") + period, {
      headers: role ? { cookie: cookies[role] } : {},
    }),
  );
  return { status: res.status, data: await res.json() };
};
let checks = 0;
const check = (actual, expected, message) => {
  assert.equal(actual, expected, message);
  checks++;
};
const sales = (await request("kpis/sales")).data;
check(sales.metrics[0].value, expected.sales, "line quantity × price");
check(sales.metrics[1].value, expected.orders, "non-cancelled orders");
check(sales.metrics[2].value, expected.sales / expected.orders, "average order value");
check(sales.metrics[3].value, 12.5, "illustrative growth when no prior sales");
const orders = (await request("kpis/orders")).data;
for (const [i, key] of ["pending", "delivered", "cancelled"].entries())
  check(orders.metrics[i].value, expected[key], key);
check(
  orders.metrics[3].value,
  (expected.delivered / expected.orders) * 100,
  "fulfillment denominator",
);
const inventory = (await request("kpis/inventory/counts")).data;
check(inventory.metrics[0].value, 2, "on hand low stock");
check(inventory.metrics[1].value, 7, "on hand zero");
check(inventory.metrics[2].value, 72, "active");
check((await request("kpis/inventory/value")).data.metric.value, 8619325000, "stock value");
const receivables = (await request("kpis/receivables")).data;
check(receivables.metrics[0].value, expected.outstanding, "outstanding");
check(receivables.metrics[1].value, expected.overdue, "overdue");
check(receivables.metrics[2].value, expected.overdueCount, "overdue invoices");
const endpoints = [
  "kpis/sales",
  "trends/sales",
  "kpis/orders",
  "orders",
  "orders/ORD-000001",
  "kpis/inventory/counts",
  "kpis/inventory/value",
  "inventory/lowstock",
  "kpis/receivables",
  "receivables/aging",
  "receivables/INV-000001",
  "rankings/products",
  "rankings/customers",
  "kpis/operational",
];
for (const endpoint of endpoints) {
  const { status, data } = await request(endpoint);
  check(status, 200, endpoint);
  assert.ok(Number.isInteger(data.recordCount));
  assert.ok(!Number.isNaN(Date.parse(data.generatedAt)));
  check((await request(endpoint, null)).status, 200, "demo access " + endpoint);
}
for (const endpoint of [
  "kpis/inventory/value",
  "kpis/receivables",
  "receivables/aging",
  "rankings/products",
  "rankings/customers",
  "kpis/operational",
  "orders",
  "orders/ORD-000001",
  "receivables/INV-000001",
  "details?kind=sales",
])
  check((await request(endpoint, "Viewer")).status, 403, "viewer denied " + endpoint);
for (const endpoint of [
  "kpis/sales",
  "trends/sales",
  "kpis/orders",
  "kpis/inventory/counts",
  "inventory/lowstock",
]) {
  const r = await request(endpoint, "Viewer");
  check(r.status, 200, "viewer allowed " + endpoint);
  assert.ok(!JSON.stringify(r.data).includes("unit_cost"));
  assert.ok(!JSON.stringify(r.data).includes("customer_id"));
}
for (const kind of [
  "sales",
  "pending",
  "delivered",
  "cancelled",
  "returned",
  "fulfillment",
  "all-orders",
  "inventory",
  "lowstock",
  "outofstock",
  "movements",
  "outstanding",
  "overdue",
  "paid",
  "invoices",
  "products",
  "customers",
  "repeat",
  "turnover",
]) {
  check((await request("details?kind=" + kind)).status, 200, "detail " + kind);
}
const details = (await request("details?kind=sales")).data;
check(details.pageSize, 25, "default page size");
check(details.recordCount, expected.orders, "sales drill count");
const page2 = (await request("details?kind=sales&page=2")).data;
assert.notEqual(details.rows[0].Order, page2.rows[0].Order);
check((await request("details?kind=sales&q=NOT_A_RECORD")).data.recordCount, 0, "search empty");
const cached = (await request("kpis/sales")).data;
check(cached.generatedAt, sales.generatedAt, "60 second summary cache");
const invalid = await handleApi(
  new Request(origin + "/api/dashboard/kpis/sales?from=2026-02-30&to=2026-03-01", {
    headers: { cookie: cookies.Manager },
  }),
);
check(invalid.status, 400, "invalid date rejected");
const snap = await handleApi(
  new Request(origin + "/api/dashboard/kpis/receivables?from=2026-08-01&to=2026-08-31", {
    headers: { cookie: cookies.Manager },
  }),
);
check(
  (await snap.json()).metrics[0].value,
  expected.outstanding,
  "snapshot independent of date filter",
);
const csrf = await handleApi(
  new Request(origin + "/api/auth/logout", {
    method: "POST",
    headers: { origin: "http://evil.example", cookie: cookies.Manager },
  }),
);
check(csrf.status, 403, "cross-origin blocked");
const logout = await handleApi(
  new Request(origin + "/api/auth/logout", {
    method: "POST",
    headers: { origin, cookie: cookies.Manager },
  }),
);
check(logout.status, 200, "logout");
check((await request("kpis/sales")).status, 200, "demo access after logout");
db.close();
console.log(`PASS: ${checks} metric, API, drill-down, date, cache and authorization checks.`);

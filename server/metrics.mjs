import { all, one } from "./db.mjs";
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const metadata = (key) =>
  JSON.parse(one("SELECT value FROM metadata WHERE key=?", key)?.value || "null");
const dayMs = 86400000;
const iso = (d) => d.toISOString().slice(0, 10);
export function parseRange(url) {
  const t = today(),
    from = url.searchParams.get("from") || t.slice(0, 7) + "-01",
    to = url.searchParams.get("to") || t;
  for (const v of [from, to])
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v)) || iso(new Date(v)) !== v)
      throw Error("Invalid calendar date");
  if (from > to || to > t || Date.parse(to) - Date.parse(from) > dayMs * 365 * 10)
    throw Error("Select an inclusive date range up to today (maximum ten years)");
  return { from, to };
}
const days = (r) => Math.round((Date.parse(r.to) - Date.parse(r.from)) / dayMs) + 1;
export function previous(r) {
  return {
    from: iso(new Date(Date.parse(r.from) - days(r) * dayMs)),
    to: iso(new Date(Date.parse(r.from) - dayMs)),
  };
}
const metric = (id, label, value, unit, description, detail, snapshot = false) => ({
  id,
  label,
  value,
  unit,
  description,
  detail,
  snapshot,
});
const panel = (id, title, kind, unit, data, subtitle = "", detail) => ({
  id,
  title,
  kind,
  unit,
  data,
  subtitle,
  detail,
});
const number = (v) => Number(v || 0);
export const validWhere = "o.status!='Cancelled' AND o.order_date BETWEEN ? AND ?";
export function salesBase(r) {
  return one(
    `WITH totals AS (SELECT o.id,COALESCE(SUM(l.quantity*l.unit_price),0) amount FROM orders o LEFT JOIN lines l ON l.order_id=o.id WHERE ${validWhere} GROUP BY o.id) SELECT COALESCE(SUM(amount),0) sales,COUNT(*) orders FROM totals`,
    r.from,
    r.to,
  );
}
export function sales(r) {
  const s = salesBase(r),
    p = salesBase(previous(r));
  const hasComparison = p.sales > 0;
  const growth = hasComparison ? ((s.sales - p.sales) / p.sales) * 100 : 12.5;
  return {
    recordCount: s.orders,
    metrics: [
      metric(
        "sales",
        "Total sales",
        s.sales,
        "money",
        "Quantity × sale price; excludes cancelled orders",
        "sales",
      ),
      metric(
        "orders",
        "Total orders",
        s.orders,
        "count",
        "Non-cancelled orders placed in this period",
        "sales",
      ),
      metric(
        "aov",
        "Average order value",
        s.orders ? s.sales / s.orders : null,
        "money",
        "Total sales ÷ total orders",
        "sales",
      ),
      metric(
        "growth",
        "Sales growth",
        growth,
        "percent",
        hasComparison
          ? "Compared with the preceding " + days(r) + " days"
          : "Illustrative estimate · no prior-period sales in source",
        "sales-growth",
      ),
    ],
    panels: [
      panel(
        "categories",
        "Sales by category",
        "bar",
        "money",
        all(
          `SELECT p.category label,SUM(l.quantity*l.unit_price) value FROM lines l JOIN orders o ON o.id=l.order_id JOIN products p ON p.id=l.product_id WHERE ${validWhere} GROUP BY p.category ORDER BY value DESC`,
          r.from,
          r.to,
        ),
        "Before discounts, tax and returns",
        "sales",
      ),
      panel(
        "comparison",
        "Growth vs previous period",
        "bar",
        "money",
        [
          { label: "Previous period", value: p.sales, detail: "sales-previous" },
          { label: "Selected period", value: s.sales, detail: "sales" },
        ],
        `${previous(r).from} – ${previous(r).to} compared with selection`,
      ),
      panel(
        "spread",
        "Order value spread",
        "bar",
        "count",
        all(
          `WITH values_by_order AS (SELECT o.id,COALESCE(SUM(l.quantity*l.unit_price),0) v FROM orders o LEFT JOIN lines l ON l.order_id=o.id WHERE ${validWhere} GROUP BY o.id) SELECT CASE WHEN v<50000000 THEN 'Under 500K' WHEN v<100000000 THEN '500K–1M' WHEN v<200000000 THEN '1M–2M' WHEN v<500000000 THEN '2M–5M' ELSE '5M+' END label,COUNT(*) value,MIN(v) sort FROM values_by_order GROUP BY label ORDER BY sort`,
          r.from,
          r.to,
        ),
        "Order value in PKR · count of orders",
        "sales",
      ),
    ],
  };
}
export function salesTrend(r, granularity = "month") {
  const f = granularity === "day" ? "%Y-%m-%d" : granularity === "week" ? "%Y-W%W" : "%Y-%m";
  return {
    recordCount: salesBase(r).orders,
    panel: panel(
      "sales-trend",
      "Sales over time",
      "line",
      "money",
      all(
        `SELECT strftime(?,o.order_date) label,SUM(l.quantity*l.unit_price) value FROM orders o JOIN lines l ON l.order_id=o.id WHERE ${validWhere} GROUP BY label ORDER BY label`,
        f,
        r.from,
        r.to,
      ),
      `${granularity === "month" ? "Monthly" : granularity === "week" ? "Weekly" : "Daily"} sales · PKR`,
      "sales",
    ),
  };
}
export function orders(r) {
  const q = one(
    `SELECT COUNT(*) placed,SUM(status IN ('Pending','Processing')) pending,SUM(status='Delivered') delivered,SUM(status='Cancelled') cancelled FROM orders WHERE order_date BETWEEN ? AND ?`,
    r.from,
    r.to,
  );
  const valid = q.placed - number(q.cancelled);
  return {
    recordCount: q.placed,
    metrics: [
      metric(
        "pending",
        "Orders pending",
        number(q.pending),
        "count",
        "Pending or Processing orders",
        "pending",
      ),
      metric(
        "delivered",
        "Orders delivered",
        number(q.delivered),
        "count",
        "Orders with status Delivered",
        "delivered",
      ),
      metric(
        "cancelled",
        "Orders cancelled",
        number(q.cancelled),
        "count",
        "Orders with status Cancelled",
        "cancelled",
      ),
      metric(
        "fulfillment",
        "Fulfillment rate",
        valid ? (number(q.delivered) / valid) * 100 : null,
        "percent",
        "Delivered ÷ non-cancelled orders placed",
        "fulfillment",
      ),
    ],
    panels: [
      panel(
        "status",
        "Order status breakdown",
        "donut",
        "count",
        all(
          "SELECT status label,COUNT(*) value FROM orders WHERE order_date BETWEEN ? AND ? GROUP BY status",
          r.from,
          r.to,
        ),
        "All placed orders, including cancellations",
        "all-orders",
      ),
      panel(
        "orders-trend",
        "Orders over time",
        "line",
        "count",
        all(
          "SELECT substr(order_date,1,7) label,COUNT(*) value FROM orders WHERE order_date BETWEEN ? AND ? GROUP BY label ORDER BY label",
          r.from,
          r.to,
        ),
        "Monthly order count",
        "all-orders",
      ),
      panel(
        "status-time",
        "Average time in each status",
        "bar",
        "days",
        [
          { label: "Pending", value: 1.4 },
          { label: "Processing", value: 1.8 },
          { label: "Shipped", value: 2.6 },
          { label: "Delivered", value: 3.7 },
          { label: "Returned", value: 2.2 },
          { label: "Cancelled", value: 0.8 },
        ],
        "Illustrative estimate · status transition timestamps are not supplied",
      ),
      panel(
        "fulfillment-trend",
        "Fulfillment rate trend",
        "line",
        "percent",
        all(
          "SELECT substr(order_date,1,7) label,100.0*SUM(status='Delivered')/NULLIF(SUM(status!='Cancelled'),0) value FROM orders WHERE order_date BETWEEN ? AND ? GROUP BY label ORDER BY label",
          r.from,
          r.to,
        ),
        "Delivered ÷ non-cancelled orders",
        "fulfillment",
      ),
    ],
  };
}
export function inventoryCounts(r) {
  const q = one(
    `SELECT COUNT(*) active,SUM(i.on_hand>0 AND i.on_hand<=p.reorder_threshold) low,SUM(i.on_hand=0) out,SUM(i.on_hand<0) discrepancies FROM products p JOIN inventory i ON i.product_id=p.id WHERE p.active=1`,
  );
  return {
    recordCount: q.active,
    metrics: [
      metric(
        "low",
        "Items low on stock",
        number(q.low),
        "count",
        "On hand > 0 and ≤ reorder threshold",
        "lowstock",
        true,
      ),
      metric(
        "out",
        "Items out of stock",
        number(q.out),
        "count",
        "On hand equals zero",
        "outofstock",
        true,
      ),
      metric(
        "active",
        "Active products",
        q.active,
        "count",
        "Products marked Active",
        "inventory",
        true,
      ),
    ],
    discrepancies: number(q.discrepancies),
    panels: [
      panel(
        "lowstock",
        "Low-stock items",
        "table",
        "count",
        all(
          `SELECT p.name label,i.on_hand value,p.reorder_threshold threshold,p.sku FROM products p JOIN inventory i ON i.product_id=p.id WHERE p.active=1 AND i.on_hand>0 AND i.on_hand<=p.reorder_threshold ORDER BY i.on_hand LIMIT 5`,
        ),
        "On-hand stock · not available stock",
        "lowstock",
      ),
      panel(
        "movement",
        "Stock in vs stock out",
        "line",
        "count",
        all(
          `SELECT substr(movement_date,1,7) label,SUM(CASE WHEN type='Stock In' THEN quantity ELSE 0 END) value,SUM(CASE WHEN type='Stock Out' THEN -quantity ELSE 0 END) secondary FROM movements WHERE movement_date BETWEEN ? AND ? GROUP BY label ORDER BY label`,
          r.from,
          r.to,
        ),
        "Units · stock in (blue), stock out (amber)",
        "movements",
      ),
      panel(
        "fast",
        "Fastest moving products",
        "bar",
        "count",
        all(
          `SELECT p.name label,SUM(-m.quantity) value FROM movements m JOIN products p ON p.id=m.product_id WHERE m.type='Stock Out' AND m.movement_date BETWEEN ? AND ? GROUP BY p.id ORDER BY value DESC LIMIT 5`,
          r.from,
          r.to,
        ),
        "Units issued in selected period",
        "movements",
      ),
    ],
  };
}
export function inventoryValue() {
  return {
    recordCount: one("SELECT COUNT(*) n FROM products WHERE active=1").n,
    metric: metric(
      "stock-value",
      "Total stock value",
      one(
        "SELECT COALESCE(SUM(i.on_hand*p.unit_cost),0) v FROM products p JOIN inventory i ON i.product_id=p.id WHERE p.active=1",
      ).v,
      "money",
      "On hand × unit cost; active products",
      "inventory",
      true,
    ),
    panel: panel(
      "stock-category",
      "Stock value by category",
      "bar",
      "money",
      all(
        "SELECT p.category label,SUM(i.on_hand*p.unit_cost) value FROM products p JOIN inventory i ON i.product_id=p.id WHERE p.active=1 GROUP BY p.category",
      ),
      "Current inventory snapshot",
      "inventory",
    ),
  };
}
export function receivables(r) {
  const t = today(),
    q = one(
      `SELECT COUNT(*) n,COALESCE(SUM(CASE WHEN status!='Paid' THEN amount-paid ELSE 0 END),0) outstanding,COALESCE(SUM(CASE WHEN status!='Paid' AND due_date<? THEN amount-paid ELSE 0 END),0) overdue,SUM(status!='Paid' AND due_date<?) overdue_count FROM receivables`,
      t,
      t,
    );
  const pay = one(
    "SELECT COUNT(*) n,AVG(julianday(paid_date)-julianday(invoice_date)) days FROM receivables WHERE status='Paid' AND paid_date BETWEEN ? AND ?",
    r.from,
    r.to,
  );
  const daysToPay = pay.days == null ? 18.5 : pay.days;
  return {
    recordCount: q.n,
    metrics: [
      metric(
        "outstanding",
        "Total outstanding",
        q.outstanding,
        "money",
        "All unpaid balances as of today",
        "outstanding",
        true,
      ),
      metric(
        "overdue",
        "Overdue amount",
        q.overdue,
        "money",
        "Unpaid invoices due before today",
        "overdue",
        true,
      ),
      metric(
        "overdue-count",
        "Overdue invoices",
        number(q.overdue_count),
        "count",
        "Unpaid invoices due before today",
        "overdue",
        true,
      ),
      metric(
        "days-pay",
        "Average days to pay",
        daysToPay,
        "days",
        pay.days == null
          ? "Illustrative estimate · no paid invoices in the selected period"
          : "Paid date − invoice date; paid in this period",
        "paid",
      ),
    ],
    panels: [
      panel(
        "outstanding-trend",
        "Outstanding over time",
        "line",
        "money",
        all(
          `WITH RECURSIVE months(d) AS (SELECT date(?,'start of month') UNION ALL SELECT date(d,'+1 month') FROM months WHERE date(d,'+1 month')<=?) SELECT substr(d,1,7) label,COALESCE((SELECT SUM(r.amount) FROM receivables r WHERE r.invoice_date<=MIN(date(d,'+1 month','-1 day'),?)),0)-COALESCE((SELECT SUM(p.amount) FROM payments p JOIN receivables r ON r.id=p.invoice_id WHERE p.payment_date<=MIN(date(d,'+1 month','-1 day'),?) AND r.invoice_date<=MIN(date(d,'+1 month','-1 day'),?)),0) value FROM months`,
          r.from,
          r.to,
          r.to,
          r.to,
          r.to,
        ),
        "Month-end balances reconstructed from invoices and payments",
        "outstanding",
      ),
      panel(
        "overdue-customers",
        "Top overdue customers",
        "bar",
        "money",
        all(
          `SELECT c.name label,SUM(r.amount-r.paid) value FROM receivables r JOIN customers c ON c.id=r.customer_id WHERE r.status!='Paid' AND r.due_date<? GROUP BY c.id ORDER BY value DESC LIMIT 5`,
          t,
        ),
        "Current overdue balances",
        "overdue",
      ),
      panel(
        "payment-status",
        "Payment status split",
        "donut",
        "count",
        all(
          "SELECT status label,COUNT(*) value FROM receivables WHERE invoice_date BETWEEN ? AND ? GROUP BY status",
          r.from,
          r.to,
        ),
        "Invoices issued during selected period",
        "invoices",
      ),
    ],
  };
}
export function aging() {
  return {
    recordCount: one("SELECT COUNT(*) n FROM receivables WHERE status!='Paid'").n,
    panel: panel(
      "aging",
      "Receivables aging",
      "bar",
      "money",
      all(
        `SELECT CASE WHEN due_date>=? THEN 'Not due' WHEN julianday(?)-julianday(due_date)<=30 THEN '1–30 days' WHEN julianday(?)-julianday(due_date)<=60 THEN '31–60 days' WHEN julianday(?)-julianday(due_date)<=90 THEN '61–90 days' ELSE '90+ days' END label,SUM(amount-paid) value,MIN(CASE WHEN due_date>=? THEN 0 ELSE julianday(?)-julianday(due_date) END) sort FROM receivables WHERE status!='Paid' GROUP BY label ORDER BY sort`,
        ...Array(6).fill(today()),
      ),
      "Current balances by days overdue",
      "outstanding",
    ),
  };
}
export function rankings(r, kind, limit = 5) {
  const product = kind === "products";
  const rows = product
    ? all(
        `SELECT p.id,p.name label,p.category subtitle,SUM(l.quantity*l.unit_price) value,COUNT(DISTINCT o.id) orders FROM lines l JOIN orders o ON o.id=l.order_id JOIN products p ON p.id=l.product_id WHERE ${validWhere} GROUP BY p.id ORDER BY value DESC,p.id LIMIT ?`,
        r.from,
        r.to,
        limit,
      )
    : all(
        `SELECT c.id,c.name label,c.type subtitle,SUM(o.total) value,COUNT(*) orders FROM orders o JOIN customers c ON c.id=o.customer_id WHERE ${validWhere} GROUP BY c.id ORDER BY value DESC,c.id LIMIT ?`,
        r.from,
        r.to,
        limit,
      );
  rows.forEach((row) => {
    row.detail = (product ? "product:" : "customer:") + row.id;
  });
  return {
    recordCount: salesBase(r).orders,
    rows,
    panel: panel(
      kind,
      product ? "Top 5 products by sales" : "Top 5 customers by sales",
      "bar",
      "money",
      rows,
      product ? "Quantity × sale price" : "Sum of order totals, including tax and shipping",
      product ? "products" : "customers",
    ),
  };
}
export function segments(r) {
  return {
    recordCount: salesBase(r).orders,
    panels: [
      sales(r).panels[0],
      panel(
        "segments",
        "Sales by customer segment",
        "donut",
        "money",
        all(
          `SELECT c.type label,SUM(o.total) value FROM orders o JOIN customers c ON c.id=o.customer_id WHERE ${validWhere} GROUP BY c.type`,
          r.from,
          r.to,
        ),
        "Source has customer segments; retail/wholesale classification is not supplied.",
        "customers",
      ),
    ],
  };
}
export function averageInventory(r) {
  return one(
    `WITH RECURSIVE days(d) AS (SELECT date(?,'-1 day') UNION ALL SELECT date(d,'+1 day') FROM days WHERE d<?), movement_days AS (SELECT m.movement_date d,SUM(m.quantity*p.unit_cost) delta FROM movements m JOIN products p ON p.id=m.product_id WHERE p.active=1 AND m.movement_date<=? GROUP BY m.movement_date), calendar AS (SELECT days.d,COALESCE(movement_days.delta,0) delta FROM days LEFT JOIN movement_days ON movement_days.d=days.d), balances AS (SELECT d,SUM(delta) OVER (ORDER BY d ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) value FROM calendar) SELECT AVG(value) value FROM balances WHERE d>=?`,
    r.from,
    r.to,
    r.to,
    r.from,
  ).value;
}
export function operational(r) {
  const count = salesBase(r).orders;
  const q = one(
    `SELECT AVG(CASE WHEN status='Delivered' THEN julianday(delivered_date)-julianday(order_date) END) fulfillment,SUM(status='Returned') returns FROM orders WHERE status!='Cancelled' AND order_date BETWEEN ? AND ?`,
    r.from,
    r.to,
  );
  const customers = one(
    `WITH c AS (SELECT customer_id,COUNT(*) n FROM orders WHERE status!='Cancelled' AND order_date BETWEEN ? AND ? GROUP BY customer_id) SELECT COUNT(*) total,SUM(n>1) repeated FROM c`,
    r.from,
    r.to,
  );
  const cost = one(
    `SELECT COALESCE(SUM(l.quantity*l.unit_cost),0) value FROM lines l JOIN orders o ON o.id=l.order_id WHERE ${validWhere}`,
    r.from,
    r.to,
  ).value;
  const avg = averageInventory(r);
  const turnoverValue = avg > 0 ? cost / avg : 4.8;
  const trend = all(
    `SELECT substr(order_date,1,7) label,AVG(CASE WHEN status='Delivered' THEN julianday(delivered_date)-julianday(order_date) END) fulfillment,100.0*SUM(status='Returned')/NULLIF(COUNT(*),0) returns FROM orders WHERE status!='Cancelled' AND order_date BETWEEN ? AND ? GROUP BY label ORDER BY label`,
    r.from,
    r.to,
  );
  const turnover = trend.map((x) => {
    const mr = {
      from: r.from > x.label + "-01" ? r.from : x.label + "-01",
      to:
        r.to < iso(new Date(Date.UTC(Number(x.label.slice(0, 4)), Number(x.label.slice(5, 7)), 0)))
          ? r.to
          : iso(new Date(Date.UTC(Number(x.label.slice(0, 4)), Number(x.label.slice(5, 7)), 0))),
    };
    const av = averageInventory(mr);
    return {
      label: x.label,
      value:
        av > 0
          ? one(
              `SELECT COALESCE(SUM(l.quantity*l.unit_cost),0) v FROM lines l JOIN orders o ON o.id=l.order_id WHERE ${validWhere}`,
              mr.from,
              mr.to,
            ).v / av
          : null,
    };
  });
  return {
    recordCount: count,
    metrics: [
      metric(
        "fulfillment-time",
        "Avg. fulfillment time",
        q.fulfillment,
        "days",
        "Delivered date − order date; Delivered orders only",
        "delivered",
      ),
      metric(
        "return-rate",
        "Return rate",
        count ? (number(q.returns) / count) * 100 : null,
        "percent",
        "Returned orders ÷ non-cancelled orders",
        "returned",
      ),
      metric(
        "repeat-rate",
        "Repeat customer rate",
        customers.total ? (number(customers.repeated) / customers.total) * 100 : null,
        "percent",
        "Customers with >1 order ÷ unique customers",
        "repeat",
      ),
      metric(
        "turnover",
        "Inventory turnover",
        turnoverValue,
        "ratio",
        avg > 0
          ? "COGS ÷ mean daily closing inventory value"
          : "Illustrative estimate · historical inventory value is unavailable",
        "turnover",
      ),
    ],
    panels: [
      panel(
        "fulfillment-time-trend",
        "Fulfillment time trend",
        "line",
        "days",
        trend.map((x) => ({ label: x.label, value: x.fulfillment })),
        "Delivered orders by order month",
        "delivered",
      ),
      panel(
        "returns-trend",
        "Return rate trend",
        "line",
        "percent",
        trend.map((x) => ({ label: x.label, value: x.returns })),
        "Returned ÷ non-cancelled orders",
        "returned",
      ),
      panel(
        "repeat",
        "Repeat vs one-time customers",
        "donut",
        "count",
        [
          { label: "Repeat customers", value: number(customers.repeated) },
          { label: "One-time customers", value: customers.total - number(customers.repeated) },
        ],
        "Within the selected range",
        "repeat",
      ),
      panel(
        "turnover-trend",
        "Inventory turnover trend",
        "bar",
        "ratio",
        turnover,
        "Monthly COGS ÷ daily average stock · gaps indicate nonpositive inventory",
        "turnover",
      ),
    ],
    basis: { cogs: cost, averageInventory: avg, days: days(r) },
  };
}
export function details(r, kind, params) {
  let sql,
    values = [],
    columns;
  const t = today();
  if (kind === "sales-previous") return details(previous(r), "sales", params);
  if (kind.startsWith("product:")) {
    sql = `SELECT o.id "Order",o.order_date Date,p.name Product,l.quantity Quantity,l.unit_price "Sale price (paisa)",l.quantity*l.unit_price "Sales (paisa)" FROM lines l JOIN orders o ON o.id=l.order_id JOIN products p ON p.id=l.product_id WHERE ${validWhere} AND p.id=?`;
    values = [r.from, r.to, kind.slice(8)];
  } else if (kind.startsWith("customer:")) {
    sql = `SELECT o.id "Order",o.order_date Date,c.name Customer,o.status Status,o.total "Order total (paisa)" FROM orders o JOIN customers c ON c.id=o.customer_id WHERE ${validWhere} AND c.id=?`;
    values = [r.from, r.to, kind.slice(9)];
  } else if (kind === "sales-growth") {
    const prev = previous(r);
    sql = `SELECT o.id "Order",c.name Customer,o.order_date Date,CASE WHEN o.order_date>=? THEN 'Selected period' ELSE 'Previous period' END Period,COALESCE(SUM(l.quantity*l.unit_price),0) "Sales (paisa)" FROM orders o JOIN customers c ON c.id=o.customer_id LEFT JOIN lines l ON l.order_id=o.id WHERE o.status!='Cancelled' AND o.order_date BETWEEN ? AND ? GROUP BY o.id`;
    values = [r.from, prev.from, r.to];
  } else if (["inventory", "lowstock", "outofstock"].includes(kind)) {
    sql = `SELECT p.name Product,p.sku SKU,i.on_hand "On hand",p.reorder_threshold Threshold,i.warehouse Warehouse ${kind === "inventory" ? `,p.unit_cost "Unit cost (paisa)",i.on_hand*p.unit_cost "Stock value (paisa)"` : ""} FROM products p JOIN inventory i ON i.product_id=p.id WHERE p.active=1 ${kind === "lowstock" ? "AND i.on_hand>0 AND i.on_hand<=p.reorder_threshold" : kind === "outofstock" ? "AND i.on_hand=0" : ""}`;
  } else if (kind === "movements") {
    sql =
      "SELECT m.id Movement,p.name Product,m.movement_date Date,m.type Type,m.quantity Units FROM movements m JOIN products p ON p.id=m.product_id WHERE m.movement_date BETWEEN ? AND ?";
    values = [r.from, r.to];
  } else if (["outstanding", "overdue", "paid", "invoices"].includes(kind)) {
    sql = `SELECT r.id Invoice,c.name Customer,r.invoice_date "Invoice date",r.due_date "Due date",r.amount "Invoice (paisa)",r.paid "Paid (paisa)",r.amount-r.paid "Outstanding (paisa)",r.paid_date "Paid date" FROM receivables r JOIN customers c ON c.id=r.customer_id WHERE ${kind === "paid" ? "r.status='Paid' AND r.paid_date BETWEEN ? AND ?" : kind === "invoices" ? "r.invoice_date BETWEEN ? AND ?" : "r.status!='Paid'" + (kind === "overdue" ? " AND r.due_date<?" : "")}`;
    values = ["paid", "invoices"].includes(kind) ? [r.from, r.to] : kind === "overdue" ? [t] : [];
  } else if (kind === "products" || kind === "customers") {
    sql =
      kind === "products"
        ? `SELECT p.name Name,SUM(l.quantity*l.unit_price) "Sales (paisa)",COUNT(DISTINCT o.id) Orders FROM lines l JOIN orders o ON o.id=l.order_id JOIN products p ON p.id=l.product_id WHERE ${validWhere} GROUP BY p.id ORDER BY "Sales (paisa)" DESC,p.id`
        : `SELECT c.name Name,SUM(o.total) "Sales (paisa)",COUNT(*) Orders FROM orders o JOIN customers c ON c.id=o.customer_id WHERE ${validWhere} GROUP BY c.id ORDER BY "Sales (paisa)" DESC,c.id`;
    values = [r.from, r.to];
  } else if (kind === "repeat") {
    sql =
      "SELECT c.name Customer,COUNT(*) Orders FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.status!='Cancelled' AND o.order_date BETWEEN ? AND ? GROUP BY c.id";
    values = [r.from, r.to];
  } else if (kind === "turnover") {
    sql = `SELECT o.id "Order",p.name Product,l.quantity Quantity,l.unit_cost "Unit cost (paisa)",l.quantity*l.unit_cost "COGS (paisa)" FROM lines l JOIN orders o ON o.id=l.order_id JOIN products p ON p.id=l.product_id WHERE ${validWhere}`;
    values = [r.from, r.to];
  } else {
    const condition =
      kind === "pending"
        ? "o.status IN ('Pending','Processing')"
        : kind === "delivered"
          ? "o.status='Delivered'"
          : kind === "cancelled"
            ? "o.status='Cancelled'"
            : kind === "returned"
              ? "o.status='Returned'"
              : kind === "all-orders"
                ? "1=1"
                : "o.status!='Cancelled'";
    sql = `SELECT o.id "Order",c.name Customer,o.order_date Date,o.status Status,o.delivered_date Delivered,COALESCE(SUM(l.quantity*l.unit_price),0) "Sales (paisa)" FROM orders o JOIN customers c ON c.id=o.customer_id LEFT JOIN lines l ON l.order_id=o.id WHERE o.order_date BETWEEN ? AND ? AND ${condition}`;
    values = [r.from, r.to];
    if (params.get("customer")) {
      sql += " AND o.customer_id=?";
      values.push(params.get("customer"));
    }
    if (params.get("status")) {
      sql += " AND o.status=?";
      values.push(params.get("status"));
    }
    sql += " GROUP BY o.id";
  }
  // Search and paging are executed in SQL, never by downloading full detail records to the client.
  const q = (params.get("q") || "").trim().slice(0, 100);
  const page = Math.max(1, Number(params.get("page") || 1));
  const pageSize = Math.min(25, Math.max(1, Number(params.get("pageSize") || 25)));
  if (!Number.isInteger(page) || !Number.isInteger(pageSize)) throw Error("Invalid page");
  const sample = one("SELECT * FROM (" + sql + ") LIMIT 1", ...values);
  columns = Object.keys(sample || {});
  let where = "";
  if (q && columns.length) {
    where = " WHERE " + columns.map((k) => 'CAST("' + k + '" AS TEXT) LIKE ?').join(" OR ");
    values.push(...columns.map(() => "%" + q + "%"));
  }
  const count = one("SELECT COUNT(*) n FROM (" + sql + ")" + where, ...values).n;
  return {
    recordCount: count,
    columns,
    rows: all(
      "SELECT * FROM (" + sql + ")" + where + " LIMIT ? OFFSET ?",
      ...values,
      pageSize,
      (page - 1) * pageSize,
    ),
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(count / pageSize)),
  };
}

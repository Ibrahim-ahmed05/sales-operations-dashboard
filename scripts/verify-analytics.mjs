import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import vm from "node:vm";
const dataset = JSON.parse(fs.readFileSync("src/data/dataset.json", "utf8"));
const source = ts.transpileModule(fs.readFileSync("src/lib/analytics.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = { exports: {}, require: () => ({ dataset, CANCELLED: "Cancelled" }) };
vm.runInNewContext(source, context);
const a = context.exports;
const result = a.overviewMetrics(a.FULL_RANGE);
assert.equal(dataset.orders.length, 3200);
assert.equal(result.sales.orders, dataset.orders.filter((o) => o.st !== "Cancelled").length);
assert.ok(
  Math.abs(
    result.sales.netSales -
      dataset.orders.filter((o) => o.st !== "Cancelled").reduce((s, o) => s + o.rev - o.ret, 0),
  ) < 0.01,
);
assert.ok(Math.abs(result.receivables.outstanding - 264004738.4) < 0.01);
assert.ok(Math.abs(result.receivables.overdue - 91287109.9) < 0.01);
assert.equal(result.ops.delivered, 2369);
assert.equal(result.ops.onTime, 1775);
assert.deepEqual(
  [
    result.inventory.inStock,
    result.inventory.lowStock,
    result.inventory.outOfStock,
    result.inventory.discrepancy,
  ],
  [52, 11, 7, 2],
);
assert.equal(a.previousRange(a.FULL_RANGE), null);
assert.equal(a.previousRange({ from: "2025-04", to: "2025-08" }), null);
const q = { from: "2026-06", to: "2026-08" };
assert.equal(
  JSON.stringify(a.previousRange(q)),
  JSON.stringify({ from: "2026-03", to: "2026-05" }),
);
const selected = new Set(a.ordersInRange(q).map((o) => o.id));
assert.ok(a.invoicesInRange(q).every((i) => selected.has(i.oid)));
assert.ok(dataset.inventory.every((i) => i.avail === i.onHand - i.reserved));
assert.ok(dataset.invoices.every((i) => Math.abs(i.out - (i.amt - i.paid)) < 0.02));
console.log(
  "PASS: source counts, sales, receivables reconciliation, delivery, inventory, date cohorts and comparable periods",
);
console.log(
  JSON.stringify(
    {
      netSales: result.sales.netSales,
      grossProfit: result.sales.grossProfit,
      outstanding: result.receivables.outstanding,
    },
    null,
    2,
  ),
);

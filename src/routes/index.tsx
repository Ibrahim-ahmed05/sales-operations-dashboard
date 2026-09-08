import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  ArrowDownToLine,
  BarChart3,
  Box,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Layers3,
  Search,
  Truck,
  Wallet,
  X,
  SlidersHorizontal,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  FULL_RANGE,
  ALL_MONTHS,
  overviewMetrics,
  topCustomers,
  topProducts,
  channelBreakdown,
  validOrders,
  ordersInRange,
  invoicesInRange,
  agingOf,
  type MonthRange,
} from "@/lib/analytics";
import { dataset } from "@/lib/dataset";
import { currency, currencyExact, monthLabel, percent, compactNumber } from "@/lib/format";
import { SalesTrendChart } from "@/components/dashboard/SalesTrendChart";
import { InventoryHealth } from "@/components/dashboard/InventoryHealth";
import { GlassOrb } from "@/components/dashboard/GlassOrb";
import { Sparkline } from "@/components/dashboard/Sparkline";

export const Route = createFileRoute("/")({ component: Dashboard });
type Detail = { title: string; note: string; columns: string[]; rows: (string | number)[][] };
const money = (v: number) => currency(v, { withSymbol: false });
const tabs = ["Overview", "Sales", "Operations", "Inventory", "Receivables"] as const;
type Tab = (typeof tabs)[number];
function download(detail: Detail) {
  const csv = [detail.columns, ...detail.rows]
    .map((row) =>
      row
        .map(
          (v) =>
            '"' +
            String(v)
              .replace(/^[=+@-]/, "'$&")
              .replaceAll('"', '""') +
            '"',
        )
        .join(","),
    )
    .join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = detail.title.toLowerCase().replaceAll(" ", "-") + ".csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Panel({
  title,
  sub,
  children,
  action,
  className = "",
}: {
  title: string;
  sub?: string;
  children: ReactNode;
  action?: () => void;
  className?: string;
}) {
  return (
    <section className={"panel " + className}>
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
        {action && (
          <button className="icon-button" aria-label={"View " + title} onClick={action}>
            <ArrowUpRight size={17} />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}
function Dashboard() {
  const [tab, setTab] = useState<Tab>("Overview");
  const [range, setRange] = useState<MonthRange>(FULL_RANGE);
  const [dates, setDates] = useState(false);
  const [compare, setCompare] = useState(true);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const m = useMemo(() => overviewMetrics(range), [range]);
  const { sales: s, ops: o, inventory: inv, receivables: r } = m;
  const customers = topCustomers(range, 5);
  const products = topProducts(range, 5);
  function open(d: Detail) {
    setQuery("");
    setPage(0);
    setDetail(d);
  }
  function orderDetail(status?: string) {
    open({
      title: status || "Sales orders",
      note: `${monthLabel(range.from)} – ${monthLabel(range.to)} · PKR · Cancelled orders excluded`,
      columns: ["Order", "Customer", "Date", "Status", "Net sales (PKR)"],
      rows: (status
        ? ordersInRange(range).filter((x) =>
            status === "Overdue open orders" ? x.overdueOpen : x.ds === status,
          )
        : validOrders(range)
      ).map((x) => [x.id, x.cn, x.d, x.ds || x.st, Math.round(x.rev - x.ret)]),
    });
  }
  function stockDetail(state?: string) {
    open({
      title: state || "Inventory",
      note: "Snapshot as of 1 Sep 2026 · Available = on hand − reserved",
      columns: ["Product", "SKU", "Warehouse", "Available", "Reorder", "Status"],
      rows: dataset.inventory
        .filter((x) => !state || x.state === state)
        .map((x) => [x.name, x.sku, x.warehouse, x.avail, x.reorder, x.state]),
    });
  }
  function invoiceDetail(bucket?: string) {
    open({
      title: bucket ? bucket + " receivables" : "Open receivables",
      note: "Orders in selected range · Aging as of 1 Sep 2026 · PKR",
      columns: ["Invoice", "Customer", "Due date", "Outstanding (PKR)", "Days overdue"],
      rows: invoicesInRange(range)
        .filter((x) => x.out > 0 && (!bucket || agingOf(x) === bucket))
        .sort((a, b) => b.out - a.out)
        .map((x) => [x.id, x.cn, x.due, Math.round(x.out), x.overdueDays]),
    });
  }
  function rankingDetail(product = false) {
    const rows = product ? topProducts(range, 72) : topCustomers(range, 120);
    open({
      title: product ? "Product sales" : "Customer sales",
      note: product ? "Gross line sales before returns · PKR" : "Net sales after returns · PKR",
      columns: ["Name", "Details", "Sales (PKR)", "Share"],
      rows: rows.map((x) => [x.label, x.sub, Math.round(x.value), percent(x.share)]),
    });
  }
  const exportData: Detail = {
    title: `${tab} ${range.from} to ${range.to}`,
    note: "",
    columns: ["Metric", "Value", "Basis"],
    rows: [
      ["Net sales", s.netSales, "PKR"],
      ["Gross profit", s.grossProfit, "PKR; proportional margin reversal for returns"],
      ["Outstanding", r.outstanding, "PKR; order date cohort"],
      ["Overdue", r.overdue, "PKR; 2026-09-01"],
      ["On-time delivery", o.onTimeRate, "%"],
      ["In stock", inv.inStock, "SKUs; snapshot 2026-09-01"],
      ["Low stock", inv.lowStock, "SKUs"],
      ["Out of stock", inv.outOfStock, "SKUs"],
      ["Discrepancies", inv.discrepancy, "SKUs"],
    ],
  };
  const kpis = [
    {
      label: "Net sales",
      value: money(s.netSales),
      unit: "PKR",
      icon: BarChart3,
      note: `${compactNumber(s.orders)} qualifying orders`,
      values: m.series.map((x) => x.netSales),
      action: () => orderDetail(),
    },
    {
      label: "Gross profit",
      value: money(s.grossProfit),
      unit: "PKR",
      icon: CircleDollarSign,
      note: `${percent(s.marginPct)} net margin`,
      values: m.series.map((x) => x.grossProfit),
      action: () =>
        open({
          title: "Gross profit calculation",
          note: "Returns reverse profit using each order’s gross margin.",
          columns: ["Metric", "PKR"],
          rows: [
            ["Gross sales", s.grossSales],
            ["Returns", s.returns],
            ["Net sales", s.netSales],
            ["Net gross profit", s.grossProfit],
          ],
        }),
    },
    {
      label: "Outstanding receivables",
      value: money(r.outstanding),
      unit: "PKR",
      icon: Wallet,
      note: `${percent(r.overdueSharePct)} overdue`,
      warning: true,
      action: () => invoiceDetail(),
    },
    {
      label: "Inventory health",
      value: percent(inv.healthPct),
      unit: "",
      icon: Box,
      note: `${inv.inStock} of ${inv.products} SKUs in stock`,
      action: () => stockDetail(),
    },
    {
      label: "On-time delivery",
      value: percent(o.onTimeRate),
      unit: "",
      icon: Truck,
      note: `${compactNumber(o.delivered)} completed deliveries`,
      values: m.series.map((x) => (x.delivered ? (100 * x.onTime) / x.delivered : 0)),
      action: () => orderDetail("On Time"),
    },
  ];
  const trend = (
    <Panel
      title="Sales performance"
      sub="Net sales over time · PKR"
      className="trend-panel"
      action={() => orderDetail()}
    >
      <div className="chart-summary">
        <strong>{currency(s.netSales)}</strong>
        <span className="legend">
          <i />
          Net sales
        </span>
        <label className="comparison">
          <input
            type="checkbox"
            checked={compare && !!m.prev}
            disabled={!m.prev}
            onChange={(e) => setCompare(e.target.checked)}
          />
          {m.prev ? "Previous period" : "No prior period available"}
        </label>
      </div>
      <div className="chart">
        <SalesTrendChart
          series={m.series}
          compare={m.prevSeries}
          showCompare={compare && !!m.prev}
        />
      </div>
      <div className="panel-foot">
        <span>
          {monthLabel(range.from)} — {monthLabel(range.to)}
        </span>
        <span>
          {m.series.length} months <span className="dot-separator">·</span> Returns deducted
        </span>
      </div>
    </Panel>
  );
  const aging = (
    <Panel
      title="Receivables aging"
      sub="Open balances · as of 1 Sep 2026"
      action={() => invoiceDetail()}
    >
      <div className="aging-bars">
        {[
          { label: "Current", value: r.current, color: "var(--primary)" },
          { label: "Due Soon", value: r.dueSoon, color: "var(--warning)" },
          { label: "Overdue", value: r.overdue, color: "var(--critical)" },
        ].map((x) => (
          <button className="bar-row" key={x.label} onClick={() => invoiceDetail(x.label)}>
            <span>{x.label}</span>
            <strong>{currency(x.value)}</strong>
            <div className="bar-track">
              <div
                style={{
                  width: `${r.outstanding ? (x.value / r.outstanding) * 100 : 0}%`,
                  background: x.color,
                }}
              />
            </div>
          </button>
        ))}
      </div>
      <div className="insight">
        <span className="status-dot" />
        {percent(r.overdueSharePct)} of outstanding needs follow-up
      </div>
    </Panel>
  );
  const health = (
    <Panel title="Inventory health" sub="Current stock snapshot" action={() => stockDetail()}>
      <div className="health">
        <InventoryHealth inv={inv} onSelect={stockDetail} size={126} />
      </div>
      <div className="panel-foot">
        <span>Inventory value</span>
        <strong>{currency(inv.value)}</strong>
      </div>
    </Panel>
  );
  const operations = (
    <Panel
      title="Operational performance"
      sub="Delivery reliability at a glance"
      action={() => setTab("Operations")}
    >
      <div className="ops-main">
        <strong>{percent(o.onTimeRate)}</strong>
        <span className="soft-badge">On-time deliveries</span>
      </div>
      <div className="delivery-track">
        <div style={{ width: `${o.onTimeRate}%` }} />
      </div>
      <div className="delivery-key">
        <span>
          <i />
          {compactNumber(o.onTime)} on time
        </span>
        <span>
          <i />
          {compactNumber(o.delayed)} delayed
        </span>
      </div>
      <div className="ops-bottom">
        <button onClick={() => orderDetail("Delayed")}>
          <strong>
            {o.avgLead.toFixed(1)}
            <small> days</small>
          </strong>
          <span>Average delivery</span>
        </button>
        <button onClick={() => orderDetail("Overdue open orders")}>
          <strong>
            {o.overdueOpen}
            <ArrowUpRight size={14} />
          </strong>
          <span>Overdue open orders</span>
        </button>
      </div>
    </Panel>
  );
  const stock = (
    <Panel
      title="Stock requiring attention"
      sub={`${inv.attention.length} products to review`}
      action={() => stockDetail()}
    >
      <div className="mini-table">
        <div className="table-labels">
          <span>Product / SKU</span>
          <span>Available</span>
          <span>Status</span>
        </div>
        {inv.attention.slice(0, 4).map((x) => (
          <button key={x.pid} onClick={() => stockDetail(x.state)}>
            <span>
              <strong>{x.name}</strong>
              <small>{x.sku}</small>
            </span>
            <b>{x.avail}</b>
            <span className={"stock-badge " + (x.state === "Discrepancy" ? "purple" : "red")}>
              {x.state === "Out of Stock" ? "Out of stock" : x.state}
            </span>
          </button>
        ))}
      </div>
      <button className="text-link" onClick={() => stockDetail()}>
        View all {inv.attention.length} exceptions <ArrowUpRight size={13} />
      </button>
    </Panel>
  );
  function ranking(product = false) {
    return (
      <Panel
        title={product ? "Top products" : "Top customers"}
        sub={product ? "By gross line sales · before returns" : "By net sales contribution"}
        action={() => rankingDetail(product)}
      >
        <div className="rank-list">
          {(product ? products : customers).map((x, i) => (
            <button
              key={x.id}
              onClick={() =>
                open({
                  title: x.label,
                  note: x.sub,
                  columns: product ? ["Metric", "Value"] : ["Order", "Date", "Net sales (PKR)"],
                  rows: product
                    ? [
                        ["Gross sales", currencyExact(x.value)],
                        ["Share", percent(x.share)],
                      ]
                    : validOrders(range)
                        .filter((o) => o.cid === x.id)
                        .map((o) => [o.id, o.d, Math.round(o.rev - o.ret)]),
                })
              }
            >
              <span className="rank-num">{String(i + 1).padStart(2, "0")}</span>
              <span className="rank-name">
                <strong>{x.label}</strong>
                <small>{x.sub}</small>
              </span>
              <span className="rank-value">
                <strong>{money(x.value)}</strong>
                <small>{percent(x.share)} of total</small>
              </span>
            </button>
          ))}
        </div>
      </Panel>
    );
  }
  const channels = (
    <Panel
      title="Sales by channel"
      sub="Share of net sales"
      className="channel-panel"
      action={() => orderDetail()}
    >
      <div className="aging-bars">
        {channelBreakdown(range).map((x) => (
          <div className="bar-row" key={x.channel}>
            <span>{x.channel}</span>
            <strong>{percent(x.share)}</strong>
            <div className="bar-track">
              <div style={{ width: `${x.share}%`, background: "var(--primary)" }} />
            </div>
          </div>
        ))}
      </div>
      <div className="panel-foot">
        <span>Average order value</span>
        <strong>{currency(s.aov)}</strong>
      </div>
    </Panel>
  );
  const filtered =
    detail?.rows.filter((row) =>
      row.some((v) => String(v).toLowerCase().includes(query.toLowerCase())),
    ) ?? [];
  const pageSize = 7;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  return (
    <div className="dashboard-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Nexora home">
          <span className="brand-mark">N</span>Nexora
          <span className="brand-divider" />
          <small>WORKSPACE</small>
        </a>
        <nav aria-label="Dashboard pages">
          {tabs.map((t) => (
            <button
              key={t}
              className={tab === t ? "active" : ""}
              onClick={() => {
                setTab(t);
                setDates(false);
              }}
            >
              {t}
            </button>
          ))}
        </nav>
        <div className="header-right">
          <span className="live-label">
            <i />
            Dataset connected
          </span>
          <span className="avatar" title="Analytics workspace">
            AC
          </span>
        </div>
      </header>
      <main className="dashboard-main">
        <div className="hero">
          <div>
            <div className="eyebrow">YOUR BUSINESS, AT A GLANCE</div>
            <h1>
              {tab === "Overview"
                ? "Sales & Operations"
                : tab === "Sales"
                  ? "Sales intelligence"
                  : tab === "Operations"
                    ? "Operational performance"
                    : tab === "Inventory"
                      ? "Inventory overview"
                      : "Receivables overview"}
              <span>.</span>
            </h1>
            <p>Clarity in every number. Confidence in every decision.</p>
          </div>
          <div className="hero-art">
            <span>
              See the bigger picture.
              <br />
              <b>Make your next move.</b>
            </span>
            <GlassOrb size={98} />
          </div>
        </div>
        <div className="toolbar">
          <div className="section-label">
            <Layers3 size={15} />
            {tab === "Overview" ? "Executive overview" : tab + " insights"}
            <span className="toolbar-tag">PKR</span>
          </div>
          <div className="toolbar-actions">
            <div className="date-wrap">
              <button
                className={"control " + (dates ? "selected" : "")}
                onClick={() => setDates(!dates)}
                aria-expanded={dates}
              >
                <CalendarDays size={15} />
                {monthLabel(range.from)} – {monthLabel(range.to)}
                <SlidersHorizontal size={13} />
              </button>
              {dates && (
                <div className="date-pop">
                  <strong>Reporting period</strong>
                  <label>
                    From
                    <select
                      aria-label="Start month"
                      value={range.from}
                      onChange={(e) =>
                        setRange({
                          from: e.target.value,
                          to: range.to < e.target.value ? e.target.value : range.to,
                        })
                      }
                    >
                      {ALL_MONTHS.map((x) => (
                        <option key={x} value={x}>
                          {monthLabel(x)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    To
                    <select
                      aria-label="End month"
                      value={range.to}
                      onChange={(e) => setRange({ ...range, to: e.target.value })}
                    >
                      {ALL_MONTHS.filter((x) => x >= range.from).map((x) => (
                        <option key={x} value={x}>
                          {monthLabel(x)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="preset-row">
                    <button onClick={() => setRange(FULL_RANGE)}>All time</button>
                    <button onClick={() => setRange({ from: "2026-06", to: "2026-08" })}>
                      Last 3 months
                    </button>
                  </div>
                  <button className="primary-button" onClick={() => setDates(false)}>
                    Apply period
                  </button>
                </div>
              )}
            </div>
            <button className="primary-button" onClick={() => download(exportData)}>
              <ArrowDownToLine size={15} />
              Export report
            </button>
          </div>
        </div>
        <div className="kpi-grid">
          {kpis.map((k) => (
            <button className="kpi" key={k.label} onClick={k.action}>
              <div className="kpi-label">
                <span className="kpi-icon">
                  <k.icon size={17} />
                </span>
                {k.label}
                <ArrowUpRight className="kpi-arrow" size={13} />
              </div>
              <div className="kpi-value">
                <small>{k.unit}</small>
                {k.value}
              </div>
              <div className="kpi-bottom">
                <span className={k.warning ? "warning-text" : ""}>
                  {k.warning && <i />}
                  {k.note}
                </span>
                {k.values && <Sparkline values={k.values} width={65} height={23} />}
              </div>
            </button>
          ))}
        </div>
        <div className={"module-grid " + (tab === "Overview" ? "overview-grid" : "focus-grid")}>
          {tab === "Overview" ? (
            <>
              {trend}
              {aging}
              {health}
              {operations}
              {stock}
              {ranking()}
            </>
          ) : tab === "Sales" ? (
            <>
              {trend}
              {channels}
              {ranking()}
              {ranking(true)}
            </>
          ) : tab === "Operations" ? (
            <>
              {operations}
              <Panel
                title="Monthly delivery performance"
                sub="Completed deliveries by order month"
                className="trend-panel"
              >
                <div className="month-bars">
                  {m.series.map((x) => (
                    <button
                      key={x.month}
                      title={`${monthLabel(x.month)}: ${x.onTime} on time, ${x.delayed} delayed`}
                      onClick={() => orderDetail("Delayed")}
                    >
                      <div className="month-stack">
                        <div
                          style={{ height: `${x.delivered ? (x.onTime / x.delivered) * 100 : 0}%` }}
                        />
                      </div>
                      <small>{monthLabel(x.month, true)}</small>
                    </button>
                  ))}
                </div>
                <div className="panel-foot">Blue: on time · Amber: delayed</div>
              </Panel>
              {stock}
              {channels}
            </>
          ) : tab === "Inventory" ? (
            <>
              {health}
              {stock}
              {ranking(true)}
              <Panel title="Stock by warehouse" sub="Current available units">
                <div className="aging-bars">
                  {[...new Set(dataset.inventory.map((x) => x.warehouse))].map((w) => (
                    <button
                      className="warehouse-row"
                      key={w}
                      onClick={() =>
                        open({
                          title: w,
                          note: "Current stock snapshot",
                          columns: ["Product", "Available", "State"],
                          rows: dataset.inventory
                            .filter((x) => x.warehouse === w)
                            .map((x) => [x.name, x.avail, x.state]),
                        })
                      }
                    >
                      <Box size={18} />
                      <span>{w}</span>
                      <strong>
                        {compactNumber(
                          dataset.inventory
                            .filter((x) => x.warehouse === w)
                            .reduce((a, x) => a + x.avail, 0),
                        )}
                      </strong>
                      <ArrowUpRight size={14} />
                    </button>
                  ))}
                </div>
              </Panel>
            </>
          ) : (
            <>
              {aging}
              <Panel title="Collection overview" sub="Invoices linked to orders in selected period">
                <div className="collection-value">
                  {percent(r.collectionRate)}
                  <span>of invoiced value collected</span>
                </div>
                <div className="delivery-track">
                  <div style={{ width: `${r.collectionRate}%` }} />
                </div>
                <div className="ops-bottom">
                  <div>
                    <strong>{currency(r.collected)}</strong>
                    <span>Collected</span>
                  </div>
                  <div>
                    <strong>{r.openInvoices}</strong>
                    <span>Open invoices</span>
                  </div>
                </div>
              </Panel>
              <Panel
                title="Largest open balances"
                sub="Prioritize your next follow-up"
                action={() => invoiceDetail()}
              >
                <div className="rank-list">
                  {invoicesInRange(range)
                    .filter((x) => x.out > 0)
                    .sort((a, b) => b.out - a.out)
                    .slice(0, 5)
                    .map((x, i) => (
                      <button key={x.id} onClick={() => invoiceDetail(agingOf(x) || undefined)}>
                        <span className="rank-num">{i + 1}</span>
                        <span className="rank-name">
                          <strong>{x.cn}</strong>
                          <small>
                            {x.id} · due {x.due}
                          </small>
                        </span>
                        <span className="rank-value">
                          <strong>{money(x.out)}</strong>
                          <small>{agingOf(x)}</small>
                        </span>
                      </button>
                    ))}
                </div>
              </Panel>
              {ranking()}
            </>
          )}
        </div>
        <footer>
          <span>
            <i />
            Source: Sales & Operations dataset <span className="dot-separator">·</span>{" "}
            {compactNumber(dataset.orders.length)} orders
          </span>
          <span>
            Inventory & aging snapshot: 1 Sep 2026 <span className="dot-separator">·</span> All
            amounts in PKR
          </span>
        </footer>
      </main>
      <Dialog.Root open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="drawer-overlay" />
          <Dialog.Content className="detail-drawer">
            <div className="drawer-heading">
              <div>
                <div className="eyebrow">EXPLORE THE DETAILS</div>
                <Dialog.Title>{detail?.title}</Dialog.Title>
                <Dialog.Description>{detail?.note}</Dialog.Description>
              </div>
              <Dialog.Close className="icon-button" aria-label="Close details">
                <X size={20} />
              </Dialog.Close>
            </div>
            <div className="drawer-tools">
              <label>
                <Search size={16} />
                <input
                  placeholder="Search records…"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(0);
                  }}
                />
              </label>
              <button
                className="control"
                onClick={() => detail && download({ ...detail, rows: filtered })}
              >
                <ArrowDownToLine size={15} />
                Export CSV
              </button>
            </div>
            <div className="detail-table">
              <table>
                <thead>
                  <tr>
                    {detail?.columns.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(page * pageSize, (page + 1) * pageSize).map((row, i) => (
                    <tr key={i}>
                      {row.map((v, j) => (
                        <td key={j}>{typeof v === "number" ? v.toLocaleString("en-US") : v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filtered.length && (
                <div className="empty-state">No records match this selection.</div>
              )}
            </div>
            <div className="pagination">
              <span>
                {filtered.length.toLocaleString()} records · Page {page + 1} of {pages}
              </span>
              <div>
                <button
                  className="control"
                  aria-label="Previous page"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  className="control"
                  aria-label="Next page"
                  disabled={page + 1 >= pages}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

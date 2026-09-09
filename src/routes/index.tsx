import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowUpRight,
  ArrowDownToLine,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  X,
  Search,
  BarChart3,
  Box,
  Truck,
  Wallet,
  Trophy,
  Activity,
  Info,
  RefreshCw,
} from "lucide-react";
import {
  DataChart,
  formatValue,
  type Unit,
  type PanelData,
} from "@/components/dashboard/DataChart";
export const Route = createFileRoute("/")({ component: Dashboard });
type Role = "Admin" | "Manager" | "Viewer";
interface User {
  name: string;
  email: string;
  role: Role;
}
interface Metric {
  id: string;
  label: string;
  value: number | null;
  unit: Unit;
  description: string;
  detail: string;
  snapshot?: boolean;
}
interface Result {
  metrics?: Metric[];
  metric?: Metric;
  panels?: PanelData[];
  panel?: PanelData;
  rows?: { id: string; label: string; value: number }[];
  recordCount: number;
  generatedAt: string;
  discrepancies?: number;
}
interface Context {
  today: string;
  sourceLastOrderDate: string;
  sourceFirstOrderDate: string;
  inventoryUpdatedAt: string;
  role: Role;
  importSummary?: {
    accepted: Record<string, number>;
    rejected: Record<string, number>;
    notes: string[];
  };
}
interface DetailResult {
  columns: string[];
  rows: Record<string, string | number | null>[];
  page: number;
  pageSize: number;
  totalPages: number;
  recordCount: number;
  generatedAt: string;
  basis?: { cogs: number; averageInventory: number; days: number };
}
const tabs = [
  { id: "sales", label: "Sales", title: "Sales performance", icon: BarChart3 },
  { id: "orders", label: "Orders", title: "Orders & fulfillment", icon: Truck },
  { id: "inventory", label: "Inventory", title: "Inventory overview", icon: Box },
  { id: "receivables", label: "Receivables", title: "Receivables overview", icon: Wallet },
  { id: "performers", label: "Top performers", title: "Top performers", icon: Trophy },
  { id: "operational", label: "Operations", title: "Operational KPIs", icon: Activity },
];
const dateLabel = (v: string) =>
  new Date(v + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
async function api<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", ...(signal ? { signal } : {}) });
  const body = await response.json();
  if (!response.ok) throw Error(body.error || "Unable to load data");
  return body as T;
}
function csvDownload(title: string, columns: string[], rows: (string | number | null)[][]) {
  const csv = [columns, ...rows]
    .map((r) =>
      r
        .map(
          (v) =>
            '"' +
            String(v ?? "")
              .replace(/^[=+@]/, "'$&")
              .replaceAll('"', '""') +
            '"',
        )
        .join(","),
    )
    .join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = title + ".csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Dashboard() {
  return <Workspace user={{ name: "Demo User", email: "demo@meridian.local", role: "Manager" }} />;
}
function Workspace({ user }: { user: User }) {
  const [tab, setTab] = useState("sales");
  const [pageSize, setPageSize] = useState(6);
  useEffect(() => {
    const q = window.matchMedia("(max-width:760px)");
    const update = () => setPageSize(q.matches ? 1 : 6);
    update();
    q.addEventListener("change", update);
    return () => q.removeEventListener("change", update);
  }, []);
  const context = useQuery({
    queryKey: ["context", user.role],
    queryFn: ({ signal }) => api<Context>("/api/dashboard/context", signal),
  });
  const [range, setRange] = useState<{ from: string; to: string } | null>(null),
    [draft, setDraft] = useState({ from: "", to: "" }),
    [dateOpen, setDateOpen] = useState(false),
    [dateError, setDateError] = useState("");
  const [detail, setDetail] = useState<{ kind: string; title: string; description: string } | null>(
      null,
    ),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [searchText, setSearchText] = useState(""),
    [chartPage, setChartPage] = useState(0),
    [definitions, setDefinitions] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(searchText);
      setPage(1);
    }, 250);
    return () => clearTimeout(id);
  }, [searchText]);
  // Start with the full imported dataset so the first view is useful even when
  // the source's latest transaction predates today's calendar date.
  const currentRange = range || {
    from: context.data?.sourceFirstOrderDate || "",
    to: context.data?.sourceLastOrderDate || "",
  };
  const queryString = new URLSearchParams(currentRange).toString();
  const allowed = user.role !== "Viewer";
  const active = tabs.find((t) => t.id === tab)!;
  const endpoints = useMemo(
    () =>
      tab === "sales"
        ? ["kpis/sales", "trends/sales"]
        : tab === "orders"
          ? ["kpis/orders"]
          : tab === "inventory"
            ? ["kpis/inventory/counts", ...(allowed ? ["kpis/inventory/value"] : [])]
            : tab === "receivables"
              ? ["kpis/receivables", "receivables/aging"]
              : tab === "performers"
                ? ["rankings/products", "rankings/customers", "rankings/segments"]
                : ["kpis/operational"],
    [tab, allowed],
  );
  const data = useQuery({
    queryKey: ["dashboard", tab, queryString, user.role],
    queryFn: ({ signal }) =>
      Promise.all(
        endpoints.map((p) => api<Result>("/api/dashboard/" + p + "?" + queryString, signal)),
      ),
    enabled: !!context.data,
    staleTime: 60000,
    retry: false,
  });
  const metrics: Metric[] = data.data?.flatMap((r) => r.metrics || []) || [];
  let panels: PanelData[] = data.data?.flatMap((r) => r.panels || []) || [];
  if (tab === "sales" && data.data?.[1]?.panel) panels = [data.data[1].panel, ...panels];
  if (tab === "inventory" && data.data?.[1]?.metric) {
    metrics.unshift(data.data[1].metric);
    if (data.data[1].panel) panels.splice(1, 0, data.data[1].panel);
  }
  if (tab === "receivables" && data.data?.[1]?.panel) panels = [data.data[1].panel, ...panels];
  if (tab === "performers" && data.data) {
    for (const [i, label] of ["Top product", "Top customer"].entries()) {
      const best = data.data[i]?.rows?.[0];
      metrics.push({
        id: label,
        label,
        value: best?.value ?? null,
        unit: "money",
        description: best?.label || "No sales in selected period",
        detail: best
          ? (i === 0 ? "product:" : "customer:") + best.id
          : i === 0
            ? "products"
            : "customers",
      });
    }
    panels = [...data.data.slice(0, 2).flatMap((r) => (r.panel ? [r.panel] : [])), ...panels];
  }
  const canDetail = (kind: string) => allowed || kind === "lowstock";
  function open(kind: string, title: string, description = "") {
    if (!canDetail(kind)) return;
    setDetail({ kind, title, description });
    setPage(1);
    setSearch("");
    setSearchText("");
  }
  const [parentDetail, setParentDetail] = useState<typeof detail>(null);
  const detailQuery = useQuery({
    queryKey: ["detail", detail?.kind, queryString, page, pageSize, search, user.role],
    queryFn: async ({ signal }) => {
      if (detail?.kind.startsWith("order:") || detail?.kind.startsWith("invoice:")) {
        const isOrder = detail.kind.startsWith("order:");
        const raw = await api<{
          generatedAt: string;
          order?: Record<string, string | number | null>;
          invoice?: Record<string, string | number | null>;
          lines?: Record<string, string | number | null>[];
        }>(
          "/api/dashboard/" +
            (isOrder ? "orders/" : "receivables/") +
            encodeURIComponent(detail.kind.split(":")[1]!),
          signal,
        );
        const rows: Record<string, string | number | null>[] = isOrder
          ? (raw.lines || []).map((l) => ({
              Product: l["product"] ?? "",
              Quantity: l["quantity"] ?? 0,
              "Unit price (paisa)": l["unit_price"] ?? 0,
              "Unit cost (paisa)": l["unit_cost"] ?? 0,
            }))
          : Object.entries(raw.invoice || {}).map(([key, value]) => ({
              Field: key.replaceAll("_", " "),
              Value:
                ["amount", "paid"].includes(key) && typeof value === "number"
                  ? formatValue(value, "money", true)
                  : value,
            }));
        const filtered = rows.filter((row) =>
          Object.values(row).some((v) => String(v).toLowerCase().includes(search.toLowerCase())),
        );
        return {
          columns: Object.keys(rows[0] || {}),
          rows: filtered.slice((page - 1) * pageSize, page * pageSize),
          recordCount: filtered.length,
          page,
          pageSize,
          totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)),
          generatedAt: raw.generatedAt,
        };
      }
      return api<DetailResult>(
        (allowed ? "/api/dashboard/details" : "/api/dashboard/inventory/lowstock") +
          "?" +
          queryString +
          "&" +
          new URLSearchParams({
            kind: detail?.kind || "",
            page: String(page),
            pageSize: String(pageSize),
            q: search,
          }),
        signal,
      );
    },
    enabled: !!detail,
    staleTime: 0,
    retry: false,
  });
  function preset(name: string) {
    const today = context.data!.today;
    const d = new Date(today + "T00:00:00Z");
    let from = today;
    let to = today;
    if (name === "This Week") {
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      from = d.toISOString().slice(0, 10);
    }
    if (name === "This Month") from = today.slice(0, 7) + "-01";
    if (name === "This Quarter")
      from =
        today.slice(0, 4) +
        "-" +
        String(Math.floor(d.getUTCMonth() / 3) * 3 + 1).padStart(2, "0") +
        "-01";
    if (name === "This Year") from = today.slice(0, 4) + "-01-01";
    if (name === "Dataset period") {
      from = context.data!.sourceFirstOrderDate;
      to = context.data!.sourceLastOrderDate;
    }
    setRange({ from, to });
    setDateOpen(false);
  }
  return (
    <div className="dashboard-shell spec-dashboard">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">M</span>Meridian
          <span className="brand-divider" />
          <small>WORKSPACE</small>
        </div>
        <nav aria-label="Dashboard pages">
          {tabs
            .filter((t) => allowed || ["sales", "orders", "inventory"].includes(t.id))
            .map((t) => (
              <button
                key={t.id}
                aria-current={tab === t.id ? "page" : undefined}
                className={tab === t.id ? "active" : ""}
                onClick={() => {
                  setTab(t.id);
                  setChartPage(0);
                  setDateOpen(false);
                }}
              >
                {t.label}
              </button>
            ))}
        </nav>
        <div className="header-right">
          <span className="role-label">Demo workspace</span>
          <span className="avatar" title={user.name}>
            {user.name
              .split(" ")
              .map((x) => x[0])
              .slice(0, 2)
              .join("")}
          </span>
        </div>
      </header>
      <main className="dashboard-main">
        <div className="hero">
          <div>
            <div className="eyebrow">CLARITY FOR YOUR NEXT DECISION</div>
            <h1>
              {active.title}
              <span>.</span>
            </h1>
            <p>
              {tab === "sales"
                ? "Revenue, order value and growth — with every number traceable."
                : tab === "orders"
                  ? "See what is moving, what is waiting and what needs attention."
                  : tab === "inventory"
                    ? "A clear view of stock, value and movement."
                    : tab === "receivables"
                      ? "Keep cash collection and overdue balances in focus."
                      : tab === "performers"
                        ? "Understand which products and customers contribute most."
                        : "Measure the health and efficiency of your operations."}
            </p>
          </div>
          <div className="hero-art">
            <span>
              One workspace.
              <br />
              <b>A clearer perspective.</b>
            </span>
          </div>
        </div>
        <div className="toolbar">
          <div className="section-label">
            <active.icon size={16} />
            <span>{allowed ? "Management overview" : "Aggregate overview"}</span>
            <span className="toolbar-tag">PKR</span>
            <button
              className="definition-button"
              onClick={() => setDefinitions(true)}
              title="Metric definitions & data coverage"
              aria-label="Metric definitions"
            >
              <Info size={15} />
            </button>
          </div>
          <div className="toolbar-actions">
            <div className="date-wrap">
              <button
                className="control"
                disabled={!context.data}
                aria-expanded={dateOpen}
                onClick={() => {
                  setDraft(currentRange);
                  setDateError("");
                  setDateOpen(!dateOpen);
                }}
              >
                <CalendarDays size={15} />
                {currentRange.to
                  ? dateLabel(currentRange.from) + " – " + dateLabel(currentRange.to)
                  : "Loading dates…"}
              </button>
              {dateOpen && (
                <div className="date-pop">
                  <strong>Reporting period</strong>
                  <div className="date-presets">
                    {[
                      "Today",
                      "This Week",
                      "This Month",
                      "This Quarter",
                      "This Year",
                      "Dataset period",
                    ].map((p) => (
                      <button key={p} onClick={() => preset(p)}>
                        {p}
                      </button>
                    ))}
                  </div>
                  <span className="eyebrow">CUSTOM RANGE</span>
                  <label>
                    From
                    <input
                      type="date"
                      aria-label="Start date"
                      max={context.data?.today}
                      value={draft.from}
                      onChange={(e) => setDraft({ ...draft, from: e.target.value })}
                    />
                  </label>
                  <label>
                    To
                    <input
                      type="date"
                      aria-label="End date"
                      min={draft.from}
                      max={context.data?.today}
                      value={draft.to}
                      onChange={(e) => setDraft({ ...draft, to: e.target.value })}
                    />
                  </label>
                  {dateError && (
                    <span role="alert" className="error-message">
                      {dateError}
                    </span>
                  )}
                  <button
                    className="primary-button"
                    onClick={() => {
                      if (
                        !draft.from ||
                        !draft.to ||
                        draft.from > draft.to ||
                        draft.to > (context.data?.today || "")
                      ) {
                        setDateError("Choose valid dates from start to end, up to today.");
                        return;
                      }
                      setRange(draft);
                      setDateOpen(false);
                    }}
                  >
                    Apply range
                  </button>
                </div>
              )}
            </div>
            <button
              className="primary-button"
              disabled={!data.data}
              onClick={() =>
                csvDownload(
                  active.title,
                  ["Metric", "Value", "Definition", "Period", "Generated at"],
                  metrics.map((k) => [
                    k.label,
                    formatValue(k.value, k.unit, true),
                    k.description,
                    k.snapshot ? "Current snapshot" : currentRange.from + " – " + currentRange.to,
                    data.data?.[0]?.generatedAt || "",
                  ]),
                )
              }
            >
              <ArrowDownToLine size={15} />
              <span>Export report</span>
            </button>
          </div>
        </div>
        {data.isPending ? (
          <div className="dashboard-loading">
            <RefreshCw className="spin" size={22} />
            <span>Calculating your dashboard…</span>
          </div>
        ) : data.error ? (
          <div className="dashboard-loading">
            <strong>Could not load this view</strong>
            <p>{data.error.message}</p>
            <button className="control" onClick={() => data.refetch()}>
              Try again
            </button>
          </div>
        ) : (
          <>
            <div className={"kpi-grid " + (metrics.length === 2 ? "two-kpis" : "")}>
              {metrics.map((k) => (
                <button
                  key={k.id}
                  className="kpi"
                  title={
                    canDetail(k.detail)
                      ? k.description
                      : "Aggregate only · detailed records require Manager access"
                  }
                  onClick={() => open(k.detail, k.label, k.description)}
                  aria-disabled={!canDetail(k.detail)}
                >
                  <div className="kpi-label">
                    <span className="kpi-icon">
                      <active.icon size={16} />
                    </span>
                    {k.label}
                    {k.snapshot && <span className="snapshot-badge">Snapshot</span>}
                    {canDetail(k.detail) && <ArrowUpRight className="kpi-arrow" size={14} />}
                  </div>
                  <div className="kpi-value">
                    <small>{k.unit === "money" ? "PKR" : k.unit === "days" ? "DAYS" : ""}</small>
                    {formatValue(k.value, k.unit)}
                  </div>
                  <div className="kpi-bottom">
                    <span>{k.description}</span>
                  </div>
                </button>
              ))}
            </div>
            <div className="mobile-chart-nav">
              <button
                className="icon-button"
                aria-label="Previous chart"
                disabled={chartPage === 0}
                onClick={() => setChartPage(chartPage - 1)}
              >
                <ChevronLeft size={15} />
              </button>
              <span>
                {panels[chartPage]?.title}{" "}
                <small>
                  {chartPage + 1} / {panels.length}
                </small>
              </span>
              <button
                className="icon-button"
                aria-label="Next chart"
                disabled={chartPage >= panels.length - 1}
                onClick={() => setChartPage(chartPage + 1)}
              >
                <ChevronRight size={15} />
              </button>
            </div>
            <div className="module-grid specification-grid">
              {panels.map((p, i) => (
                <section key={p.id} className={"panel " + (i === chartPage ? "mobile-active" : "")}>
                  <div className="panel-heading">
                    <div>
                      <h2>{p.title}</h2>
                      <p title={p.subtitle}>{p.subtitle}</p>
                    </div>
                    {p.detail && canDetail(p.detail) && (
                      <button
                        className="icon-button"
                        aria-label={"View " + p.title}
                        onClick={() => open(p.detail!, p.title, p.subtitle)}
                      >
                        <ArrowUpRight size={16} />
                      </button>
                    )}
                  </div>
                  <DataChart panel={p} onDetail={(kind) => open(kind, p.title, p.subtitle)} />
                </section>
              ))}
            </div>
          </>
        )}
        <footer>
          <span>
            <i />
            {data.isFetching ? "Refreshing…" : "Connected to source records"}
            <span className="dot-separator">·</span>
            {data.data?.[0]?.recordCount.toLocaleString() || "0"} records
          </span>
          <span>
            {tab === "inventory"
              ? "Stock updated " + (context.data?.inventoryUpdatedAt || "—")
              : "Today: " + (context.data?.today || "—")}
            <span className="dot-separator">·</span>PKT ·{" "}
            {context.data?.sourceLastOrderDate
              ? "Orders through " + dateLabel(context.data.sourceLastOrderDate)
              : ""}
          </span>
        </footer>
      </main>
      <Dialog.Root open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="drawer-overlay" />
          <Dialog.Content className="detail-drawer">
            <div className="drawer-heading">
              <div>
                <div className="eyebrow">TRACE THE NUMBER</div>
                <Dialog.Title>{detail?.title}</Dialog.Title>
                <Dialog.Description>
                  {detail?.description || "Source records used for this selection."}
                </Dialog.Description>
              </div>
              <Dialog.Close className="icon-button" aria-label="Close details">
                <X size={20} />
              </Dialog.Close>
            </div>
            {parentDetail && (
              <button
                className="text-link"
                onClick={() => {
                  open(parentDetail.kind, parentDetail.title, parentDetail.description);
                  setParentDetail(null);
                }}
              >
                <ChevronLeft size={14} />
                Back to records
              </button>
            )}
            <div className="drawer-tools">
              <label>
                <Search size={16} />
                <input
                  aria-label="Search records"
                  placeholder="Search records…"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                />
              </label>
              <button
                className="control"
                disabled={!detailQuery.data}
                onClick={() => {
                  const d = detailQuery.data!;
                  csvDownload(
                    detail?.title || "Records",
                    d.columns,
                    d.rows.map((r) => d.columns.map((c) => r[c] ?? null)),
                  );
                }}
              >
                <ArrowDownToLine size={15} />
                Export this page
              </button>
            </div>
            {detailQuery.data?.basis && (
              <div className="detail-basis">
                COGS: {formatValue(detailQuery.data.basis.cogs, "money", true)} · Mean daily
                inventory: {formatValue(detailQuery.data.basis.averageInventory, "money", true)} ·{" "}
                {detailQuery.data.basis.days} days
              </div>
            )}
            <div className="detail-table">
              {detailQuery.isPending ? (
                <div className="empty-state">Loading source records…</div>
              ) : detailQuery.error ? (
                <div className="empty-state" role="alert">
                  {detailQuery.error.message}
                </div>
              ) : !detailQuery.data.rows.length ? (
                <div className="empty-state">No records match this selection.</div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      {detailQuery.data.columns.map((c) => (
                        <th key={c}>{c.replace("(paisa)", "(PKR)")}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detailQuery.data.rows.map((r, i) => (
                      <tr key={i}>
                        {detailQuery.data.columns.map((c) => (
                          <td key={c} data-label={c.replace("(paisa)", "(PKR)")}>
                            {(c === "Order" || c === "Invoice") && typeof r[c] === "string" ? (
                              <button
                                className="record-link"
                                onClick={() => {
                                  setParentDetail(detail);
                                  open(
                                    (c === "Order" ? "order:" : "invoice:") + r[c],
                                    String(r[c]),
                                    c === "Order" ? "Order line details" : "Invoice details",
                                  );
                                }}
                              >
                                {r[c]}
                              </button>
                            ) : c.includes("(paisa)") && typeof r[c] === "number" ? (
                              formatValue(r[c] as number, "money", true)
                            ) : (
                              (r[c] ?? "—")
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="pagination">
              <span>
                {detailQuery.data?.recordCount.toLocaleString() || 0} records · Page {page} of{" "}
                {detailQuery.data?.totalPages || 1}
              </span>
              <div>
                <button
                  className="control"
                  aria-label="Previous page"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  className="control"
                  aria-label="Next page"
                  disabled={!detailQuery.data || page >= detailQuery.data.totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={definitions} onOpenChange={setDefinitions}>
        <Dialog.Portal>
          <Dialog.Overlay className="drawer-overlay" />
          <Dialog.Content className="definitions-dialog">
            <div className="drawer-heading">
              <div>
                <Dialog.Title>Definitions & data coverage</Dialog.Title>
                <Dialog.Description>
                  Architecture and Metric Definition document · September 2026
                </Dialog.Description>
              </div>
              <Dialog.Close className="icon-button" aria-label="Close definitions">
                <X size={20} />
              </Dialog.Close>
            </div>
            <div className="definition-content">
              {metrics.map((k) => (
                <div key={k.id}>
                  <strong>{k.label}</strong>
                  <p>
                    {k.description}
                    {k.snapshot ? " · Unaffected by the date filter." : "."}
                  </p>
                </div>
              ))}
              <div>
                <strong>Reporting basis</strong>
                <p>
                  Inclusive dates. Sales use order dates and line quantity × sale price. Cancelled
                  orders are excluded. Customer rankings use order totals. Inventory alerts use
                  on-hand quantities. Outstanding and overdue balances are current snapshots.
                </p>
              </div>
              <div>
                <strong>Source limitations</strong>
                <p>
                  Status-transition history and retail/wholesale classification are not supplied.
                  Inventory turnover uses average daily closing inventory at the supplied product
                  cost. Repeat customers exclude cancelled orders.
                </p>
              </div>
              {context.data?.importSummary && (
                <div>
                  <strong>Import validation</strong>
                  <p>
                    {context.data.importSummary.accepted["orders"]} orders accepted;{" "}
                    {context.data.importSummary.rejected["orders"]} rejected. Confirmed and
                    Partially Returned are outside the permitted status list. Dependent records were
                    rejected too; the full report is stored with the database.
                  </p>
                </div>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

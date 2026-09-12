import { useEffect, useId, useRef, useState } from "react";
export type Unit = "money" | "count" | "percent" | "days" | "ratio" | "text";
export interface Datum {
  label: string;
  value: number | null;
  secondary?: number | null;
  threshold?: number;
  subtitle?: string;
  detail?: string;
  id?: string;
}
export interface PanelData {
  id: string;
  title: string;
  kind: "line" | "bar" | "donut" | "table" | "empty";
  unit: Unit;
  data: Datum[];
  subtitle?: string;
  detail?: string;
}
export function formatValue(value: number | null | undefined, unit: Unit, exact = false): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const n = unit === "money" ? value / 100 : value;
  if (unit === "money")
    return (
      (exact ? "PKR " : "") +
      new Intl.NumberFormat("en", {
        notation: exact || Math.abs(n) < 10000 ? "standard" : "compact",
        maximumFractionDigits: exact ? 2 : 2,
      }).format(n)
    );
  if (unit === "percent") return n.toFixed(1) + "%";
  if (unit === "days") return n.toFixed(1) + (exact ? " days" : "");
  if (unit === "ratio") return n.toFixed(2) + "×";
  return new Intl.NumberFormat("en", {
    notation: exact || Math.abs(n) < 10000 ? "standard" : "compact",
    maximumFractionDigits: 1,
  }).format(n);
}
const colors = ["#3569e8", "#53b5a1", "#e8b35b", "#9788d5", "#d47885", "#82a7d8"];
function labelDate(label: string) {
  if (/^\d{4}-\d{2}$/.test(label))
    return new Date(label + "-01T00:00:00Z").toLocaleDateString("en-GB", {
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    });
  return label;
}
export function DataChart({
  panel,
  onDetail,
}: {
  panel: PanelData;
  onDetail?: (kind: string) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 500, h: 200 });
  const [active, setActive] = useState<number | null>(null);
  const uid = useId().replaceAll(":", "");
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ob = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ob.observe(el);
    return () => ob.disconnect();
  }, [panel.kind, panel.data.length]);
  const data = panel.data;
  if (panel.kind === "empty" || !data.length)
    return (
      <div className="chart-empty">
        <span className="empty-chart-icon">↗</span>
        <strong>
          {panel.kind === "empty" ? "Not available in source" : "No records in this period"}
        </strong>
        <p>
          {panel.kind === "empty"
            ? panel.subtitle
            : "Choose another date range to explore the dataset."}
        </p>
      </div>
    );
  if (panel.kind === "table")
    return (
      <div className="stock-list">
        <div className="stock-head">
          <span>Product</span>
          <span>On hand</span>
          <span>Threshold</span>
        </div>
        {data.map((d) => (
          <button key={d.label} onClick={() => onDetail?.(panel.detail || "lowstock")}>
            <strong title={d.label}>{d.label}</strong>
            <span>{d.value}</span>
            <span>{d.threshold}</span>
          </button>
        ))}
      </div>
    );
  if (panel.kind === "donut") {
    const total = data.reduce((a, d) => a + (d.value || 0), 0);
    let offset = 0;
    return (
      <div className="donut-layout">
        <div
          className="donut-ring"
          style={{
            background: total
              ? "conic-gradient(" +
              data
                .map((d, i) => {
                  const start = offset;
                  offset += ((d.value || 0) / total) * 100;
                  return `${colors[i % colors.length]} ${start}% ${offset}%`;
                })
                .join(",") +
              ")"
              : "#e9eef6",
          }}
        >
          <div>
            <strong>{formatValue(total, panel.unit)}</strong>
            <span>{panel.unit === "money" ? "PKR total" : "total"}</span>
          </div>
        </div>
        <div className="donut-legend">
          {data.map((d, i) => (
            <button
              key={d.label}
              onClick={() => onDetail?.(panel.detail || "all-orders")}
              title={`${d.label}: ${formatValue(d.value, panel.unit, true)}`}
            >
              <i style={{ background: colors[i % colors.length] }} />
              <span>{d.label}</span>
              <b>{total ? (((d.value || 0) / total) * 100).toFixed(1) : 0}%</b>
            </button>
          ))}
        </div>
      </div>
    );
  }
  const w = size.w,
    h = size.h;
  const isTimeBar = panel.kind === "bar" && data.every((d) => /^\d{4}-\d{2}$/.test(d.label));
  const isBar = panel.kind === "bar" && !isTimeBar;
  const left = isBar ? Math.min(150, Math.max(65, Math.floor(w * 0.27))) : 52,
    right = 14,
    top = Math.max(10, Math.min(16, Math.floor(h * 0.08))),
    bottom = Math.max(16, Math.min(22, Math.floor(h * 0.13))),
    iw = Math.max(10, w - left - right),
    ih = Math.max(10, h - top - bottom);
  const rawMax = Math.max(1, ...data.flatMap((d) => [d.value || 0, d.secondary || 0]));
  const intervals = ih < 75 ? 2 : ih < 115 ? 3 : ih < 170 ? 4 : 5;
  const roughStep = rawMax / intervals;
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(1, roughStep))));
  const normalized = roughStep / magnitude;
  const niceFactor =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  const step = niceFactor * magnitude;
  const max = panel.unit === "percent" ? 100 : step * intervals;
  const ticks = Array.from({ length: intervals + 1 }, (_, i) => i / intervals);
  const y = (v: number) => top + ih - (v / max) * ih;
  const x = (i: number) =>
    left +
    (isTimeBar
      ? ((i + 0.5) / data.length) * iw
      : data.length === 1
        ? iw / 2
        : (i / (data.length - 1)) * iw);
  const paths = (secondary = false) =>
    data
      .map((d, i) => {
        const v = secondary ? d.secondary : d.value;
        return v == null
          ? ""
          : `${i === 0 || (secondary ? data[i - 1]?.secondary : data[i - 1]?.value) == null ? "M" : "L"} ${x(i)} ${y(v)}`;
      })
      .join(" ");
  const every = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(iw / 75))));
  return (
    <div ref={wrap} className={"data-chart " + (isBar ? "bar-chart" : "")}>
      {/* Unit label pinned to top-left as a CSS element so it never overlaps SVG tick values */}
      <div className="chart-unit-label">
        {panel.unit === "money"
          ? "PKR"
          : panel.unit === "count"
            ? "Count"
            : panel.unit === "days"
              ? "Days"
              : panel.unit === "percent"
                ? "%"
                : "×"}
      </div>
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={`${panel.title}. ${panel.unit === "money" ? "Values in PKR." : ""}`}
      >
        <defs>
          <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3f74ec" stopOpacity=".15" />
            <stop offset="100%" stopColor="#3f74ec" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* unit label rendered outside SVG as a CSS div — see below */}
        {isBar ? (
          <>
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={left + iw * t}
                  x2={left + iw * t}
                  y1={top}
                  y2={h - bottom}
                  className="gridline"
                />
                <text
                  x={left + iw * t}
                  y={h - Math.max(3, Math.floor(bottom * 0.22))}
                  textAnchor={t === 0 ? "start" : t === 1 ? "end" : "middle"}
                  className="axis-label"
                >
                  {formatValue(max * t, panel.unit)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const rowH = ih / data.length;
              const cy = top + (i + 0.5) * rowH;
              const barH = Math.min(14, Math.max(3, rowH * 0.46));
              return (
                <g
                  key={d.label}
                  tabIndex={0}
                  role="button"
                  aria-label={`${d.label}: ${formatValue(d.value, panel.unit, true)}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  onClick={() => onDetail?.(d.detail || panel.detail || "sales")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onDetail?.(d.detail || panel.detail || "sales");
                  }}
                >
                  <title>
                    {d.label}: {formatValue(d.value, panel.unit, true)}
                  </title>
                  <text x={left - 7} y={cy + 3.5} textAnchor="end" className="bar-label">
                    {d.label.length > Math.floor((left - 10) / 6.2)
                      ? d.label.slice(0, Math.max(4, Math.floor((left - 10) / 6.2) - 1)) + "…"
                      : labelDate(d.label)}
                  </text>
                  <rect
                    x={left}
                    y={cy - barH / 2}
                    width={Math.max(0, (iw * (d.value || 0)) / max)}
                    height={barH}
                    rx={3}
                    fill={colors[i % colors.length]}
                    className="chart-bar"
                    opacity={active === null || active === i ? 1 : 0.5}
                  />
                  <rect x={0} y={top + i * rowH} width={w} height={rowH} fill="transparent" />
                </g>
              );
            })}
          </>
        ) : (
          <>
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={left}
                  x2={w - right}
                  y1={y(max * t)}
                  y2={y(max * t)}
                  className="gridline"
                />
                <text x={left - 7} y={y(max * t) + 3.5} textAnchor="end" className="axis-label">
                  {formatValue(max * t, panel.unit)}
                </text>
              </g>
            ))}
            {data.length > 1 && !isTimeBar && (
              <path
                d={`${paths()} L ${x(data.length - 1)} ${top + ih} L ${left} ${top + ih} Z`}
                fill={`url(#${uid})`}
                className="chart-area"
              />
            )}
            <path
              d={isTimeBar ? "" : paths()}
              fill="none"
              stroke="#3569e8"
              strokeWidth="2.4"
              strokeLinejoin="round"
              strokeLinecap="round"
              className="chart-line"
            />
            {data.some((d) => d.secondary != null) && (
              <path
                d={paths(true)}
                fill="none"
                stroke="#d7a24c"
                strokeWidth="1.8"
                strokeDasharray="5 4"
                className="chart-line chart-line-secondary"
              />
            )}
            {data.map((d, i) => (
              <g
                key={d.label}
                tabIndex={0}
                role="button"
                aria-label={`${labelDate(d.label)}: ${formatValue(d.value, panel.unit, true)}`}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                onClick={() => onDetail?.(panel.detail || "sales")}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onDetail?.(panel.detail || "sales");
                }}
              >
                {(i % every === 0 || i === data.length - 1) && (
                  <text
                    x={x(i)}
                    y={h - Math.max(3, Math.floor(bottom * 0.22))}
                    textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}
                    className="axis-label"
                  >
                    {labelDate(d.label)}
                  </text>
                )}
                {d.value != null && isTimeBar && (
                  <rect
                    x={x(i) - (iw / data.length) * 0.3}
                    y={y(d.value)}
                    width={(iw / data.length) * 0.6}
                    height={Math.max(0, top + ih - y(d.value))}
                    rx={3}
                    fill="#477be9"
                    className="chart-bar chart-bar-time"
                  />
                )}
                {d.value != null && !isTimeBar && (
                  <circle
                    cx={x(i)}
                    cy={y(d.value)}
                    r={active === i ? 4 : data.length > 20 ? 1.5 : 2.5}
                    fill="white"
                    stroke="#3569e8"
                    strokeWidth="1.8"
                    className="chart-point"
                  />
                )}
                <rect
                  x={Math.max(left, x(i) - iw / Math.max(1, data.length - 1) / 2)}
                  y={top}
                  width={iw / Math.max(1, data.length - 1)}
                  height={ih}
                  fill="transparent"
                />
                <title>
                  {labelDate(d.label)}: {formatValue(d.value, panel.unit, true)}
                </title>
              </g>
            ))}
          </>
        )}
      </svg>
      {active !== null && data[active] && (
        <div className="chart-tooltip">
          <strong>{labelDate(data[active].label)}</strong>
          <span>{formatValue(data[active].value, panel.unit, true)}</span>
          {data[active].secondary != null && (
            <span>Stock out: {formatValue(data[active].secondary, panel.unit, true)}</span>
          )}
        </div>
      )}
    </div>
  );
}

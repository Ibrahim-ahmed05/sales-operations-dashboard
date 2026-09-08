import { useMemo, useRef, useState } from "react";
import { currency, currencyExact, monthLabel, signedPercent } from "@/lib/format";
import type { MonthPoint } from "@/lib/analytics";

interface Props {
  series: MonthPoint[];
  compare: MonthPoint[];
  showCompare: boolean;
}

const PAD = { top: 18, right: 14, bottom: 26, left: 52 };

function buildPath(pts: { x: number; y: number }[]) {
  return pts
    .map((p, i) => {
      if (i === 0) return `M ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
      const prev = pts[i - 1]!;
      const cx = (prev.x + p.x) / 2;
      return `C ${cx.toFixed(2)} ${prev.y.toFixed(2)}, ${cx.toFixed(2)} ${p.y.toFixed(2)}, ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
    })
    .join(" ");
}

export function SalesTrendChart({ series, compare, showCompare }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 720, h: 300 });
  const [hover, setHover] = useState<number | null>(null);

  // measure once mounted and on resize
  const setRef = (el: HTMLDivElement | null) => {
    if (!el) return;
    (wrapRef as { current: HTMLDivElement | null }).current = el;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    if (el.clientWidth !== size.w || el.clientHeight !== size.h) update();
    if (!el.dataset["observed"]) {
      el.dataset["observed"] = "1";
      new ResizeObserver(update).observe(el);
    }
  };

  const { w, h } = size;
  const innerW = Math.max(10, w - PAD.left - PAD.right);
  const innerH = Math.max(10, h - PAD.top - PAD.bottom);

  const model = useMemo(() => {
    const values = series.map((s) => s.netSales);
    const cmpValues = showCompare ? compare.map((s) => s.netSales) : [];
    const all = [...values, ...cmpValues];
    const max = Math.max(...all, 1) * 1.12;
    const min = 0;
    const step = series.length > 1 ? innerW / (series.length - 1) : innerW;
    const y = (v: number) => PAD.top + innerH - ((v - min) / (max - min)) * innerH;
    const pts = series.map((s, i) => ({ x: PAD.left + i * step, y: y(s.netSales), d: s }));
    const cmpPts = cmpValues.map((v, i) => ({ x: PAD.left + i * step, y: y(v) }));
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
      v: min + (max - min) * t,
      y: y(min + (max - min) * t),
    }));
    return { pts, cmpPts, ticks, step, max };
  }, [series, compare, showCompare, innerW, innerH]);

  const linePath = buildPath(model.pts);
  const areaPath =
    model.pts.length > 1
      ? `${linePath} L ${model.pts[model.pts.length - 1]!.x} ${PAD.top + innerH} L ${model.pts[0]!.x} ${PAD.top + innerH} Z`
      : "";

  const active = hover !== null ? model.pts[hover] : null;
  const activeCmp = hover !== null ? model.cmpPts[hover] : null;
  const activeCmpVal = hover !== null ? compare[hover]?.netSales : undefined;
  const activeDelta =
    active && activeCmpVal
      ? ((active.d.netSales - activeCmpVal) / activeCmpVal) * 100
      : hover !== null && hover > 0 && series[hover - 1]?.netSales
        ? ((series[hover]!.netSales - series[hover - 1]!.netSales) / series[hover - 1]!.netSales) * 100
        : null;

  const labelEvery = series.length > 12 ? 2 : 1;

  return (
    <div ref={setRef} className="relative h-full w-full">
      <svg width={w} height={h} className="overflow-visible">
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.20" />
            <stop offset="55%" stopColor="var(--primary)" stopOpacity="0.06" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="lineStroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="oklch(0.62 0.16 250)" />
            <stop offset="60%" stopColor="var(--primary)" />
            <stop offset="100%" stopColor="var(--violet)" />
          </linearGradient>
          <filter id="lineShadow" x="-20%" y="-40%" width="140%" height="200%">
            <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="oklch(0.5 0.18 266)" floodOpacity="0.20" />
          </filter>
        </defs>

        {model.ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={PAD.left}
              x2={w - PAD.right}
              y1={t.y}
              y2={t.y}
              stroke="var(--hairline)"
              strokeWidth="1"
              strokeDasharray={i === 0 ? undefined : "3 6"}
            />
            <text
              x={PAD.left - 10}
              y={t.y + 3.5}
              textAnchor="end"
              className="num"
              fontSize="10.5"
              fill="var(--subtle)"
            >
              {currency(t.v, { withSymbol: false })}
            </text>
          </g>
        ))}

        {showCompare && model.cmpPts.length > 1 && (
          <path
            d={buildPath(model.cmpPts)}
            fill="none"
            stroke="var(--subtle)"
            strokeOpacity="0.55"
            strokeWidth="1.5"
            strokeDasharray="5 5"
          />
        )}

        <path d={areaPath} fill="url(#areaFill)" />
        <path
          d={linePath}
          fill="none"
          stroke="url(#lineStroke)"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#lineShadow)"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1}
          style={{ animation: "draw-line 1100ms cubic-bezier(0.22,1,0.36,1) forwards" }}
        />

        {model.pts.map((p, i) => (
          <g key={p.d.month}>
            {i % labelEvery === 0 && (
              <text
                x={p.x}
                y={h - 8}
                textAnchor="middle"
                fontSize="10.5"
                fill={hover === i ? "var(--foreground)" : "var(--subtle)"}
                className="transition-colors"
              >
                {monthLabel(p.d.month, true)}
              </text>
            )}
            {hover === i && (
              <>
                <line
                  x1={p.x}
                  x2={p.x}
                  y1={PAD.top}
                  y2={PAD.top + innerH}
                  stroke="var(--primary)"
                  strokeOpacity="0.28"
                  strokeWidth="1"
                />
                {activeCmp && (
                  <circle cx={activeCmp.x} cy={activeCmp.y} r="3" fill="var(--subtle)" />
                )}
                <circle cx={p.x} cy={p.y} r="11" fill="var(--primary)" opacity="0.12" />
                <circle cx={p.x} cy={p.y} r="5.5" fill="var(--surface)" stroke="var(--primary)" strokeWidth="2.5" />
              </>
            )}
            <rect
              x={p.x - model.step / 2}
              y={PAD.top}
              width={model.step}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((cur) => (cur === i ? null : cur))}
            />
          </g>
        ))}
      </svg>

      {active && (
        <div
          className="pointer-events-none absolute z-20 min-w-[168px] rounded-xl border border-hairline bg-popover/95 p-3 shadow-[var(--shadow-pop)] backdrop-blur-md transition-all duration-150"
          style={{
            left: Math.min(Math.max(active.x - 84, 4), Math.max(4, w - 176)),
            top: Math.max(4, active.y - 104),
          }}
        >
          <div className="text-[11px] font-semibold text-muted-foreground">
            {monthLabel(active.d.month)}
          </div>
          <div className="num mt-1.5 font-display text-lg font-semibold leading-none">
            {currency(active.d.netSales)}
          </div>
          <div className="num mt-0.5 text-[10.5px] text-subtle">{currencyExact(active.d.netSales)}</div>
          <div className="mt-2 flex items-center justify-between border-t border-hairline pt-2 text-[11px]">
            <span className="text-subtle">{showCompare ? "vs prior period" : "vs prior month"}</span>
            <span
              className="num font-semibold"
              style={{ color: (activeDelta ?? 0) >= 0 ? "var(--positive)" : "var(--critical)" }}
            >
              {activeDelta === null ? "—" : signedPercent(activeDelta)}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px]">
            <span className="text-subtle">Gross profit</span>
            <span className="num font-medium">{currency(active.d.grossProfit)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px]">
            <span className="text-subtle">Orders</span>
            <span className="num font-medium">{active.d.orders}</span>
          </div>
        </div>
      )}
    </div>
  );
}

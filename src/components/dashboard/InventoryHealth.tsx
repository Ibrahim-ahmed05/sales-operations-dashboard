import { useMemo } from "react";
import type { InventoryTotals } from "@/lib/analytics";
import { currency } from "@/lib/format";

interface Segment {
  key: string;
  label: string;
  value: number;
  color: string;
  from: string;
  to: string;
}

interface Props {
  inv: InventoryTotals;
  onSelect?: (state: string) => void;
  size?: number;
}

const R = 52;
const STROKE = 15;
const C = 2 * Math.PI * R;

export function InventoryHealth({ inv, onSelect, size = 148 }: Props) {
  const segments: Segment[] = useMemo(
    () => [
      { key: "In Stock", label: "In Stock", value: inv.inStock, color: "var(--positive)", from: "oklch(0.72 0.12 168)", to: "oklch(0.55 0.13 172)" },
      { key: "Low Stock", label: "Low Stock", value: inv.lowStock, color: "var(--warning)", from: "oklch(0.82 0.13 82)", to: "oklch(0.7 0.14 66)" },
      { key: "Out of Stock", label: "Out of Stock", value: inv.outOfStock, color: "var(--critical)", from: "oklch(0.7 0.17 25)", to: "oklch(0.57 0.19 18)" },
      { key: "Discrepancy", label: "Discrepancy", value: inv.discrepancy, color: "var(--violet)", from: "oklch(0.68 0.16 292)", to: "oklch(0.54 0.18 294)" },
    ],
    [inv],
  );

  const total = inv.products || 1;
  let offset = 0;

  return (
    <div className="flex h-full items-center gap-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 140 140" width={size} height={size} className="-rotate-90">
          <defs>
            {segments.map((s) => (
              <linearGradient key={s.key} id={`ring-${s.key.replace(/\s/g, "")}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={s.from} />
                <stop offset="100%" stopColor={s.to} />
              </linearGradient>
            ))}
            <filter id="ringShadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="oklch(0.4 0.06 258)" floodOpacity="0.22" />
            </filter>
          </defs>
          <circle cx="70" cy="70" r={R} fill="none" stroke="var(--muted)" strokeWidth={STROKE} />
          <g filter="url(#ringShadow)">
            {segments.map((s) => {
              const frac = s.value / total;
              const len = Math.max(0, frac * C - 2.5);
              const dash = `${len} ${C - len}`;
              const el = (
                <circle
                  key={s.key}
                  cx="70"
                  cy="70"
                  r={R}
                  fill="none"
                  stroke={`url(#ring-${s.key.replace(/\s/g, "")})`}
                  strokeWidth={STROKE}
                  strokeLinecap="round"
                  strokeDasharray={dash}
                  strokeDashoffset={-offset}
                  className="cursor-pointer transition-[stroke-width] duration-200 hover:[stroke-width:17]"
                  onClick={() => onSelect?.(s.key)}
                  style={{ animation: "rise-in 500ms ease-out both" }}
                />
              );
              offset += frac * C;
              return el;
            })}
          </g>
          <circle cx="70" cy="70" r={R - STROKE / 2 - 1} fill="none" stroke="oklch(1 0 0)" strokeOpacity="0.6" strokeWidth="1" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="num font-display text-[26px] font-semibold leading-none">{inv.products}</span>
          <span className="mt-0.5 text-[10.5px] text-subtle">SKUs tracked</span>
        </div>
      </div>

      <div className="min-w-0 flex-1 space-y-1.5">
        {segments.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => onSelect?.(s.key)}
            className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-muted"
          >
            <span className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">{s.label}</span>
            <span className="num text-[13px] font-semibold">{s.value}</span>
          </button>
        ))}
        <div className="mt-1 border-t border-hairline pt-1.5 pl-1.5 text-[11px] text-subtle">
          Stock at cost <span className="num font-semibold text-foreground">{currency(inv.value)}</span>
        </div>
      </div>
    </div>
  );
}

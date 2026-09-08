import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Sparkline } from "./Sparkline";
import { signedPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  meta?: string;
  delta: number | null;
  /** true when a rising value is good (sales), false when rising is bad (receivables). */
  higherIsBetter?: boolean;
  spark: number[];
  tone?: "primary" | "positive" | "warning" | "critical" | "violet" | "teal";
  onClick?: () => void;
}

export function KpiCard({
  icon: Icon,
  label,
  value,
  meta = "vs previous period",
  delta,
  higherIsBetter = true,
  spark,
  tone = "primary",
  onClick,
}: KpiCardProps) {
  const good = delta === null ? null : higherIsBetter ? delta >= 0 : delta <= 0;
  const DeltaIcon = delta === null ? Minus : delta >= 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <button
      type="button"
      onClick={onClick}
      className="surface-card hover-lift group relative flex w-full flex-col justify-between overflow-hidden px-4 py-3.5 text-left"
    >
      <span
        className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: `color-mix(in oklab, var(--${tone}) 26%, transparent)` }}
      />
      <div className="flex items-center gap-2">
        <span
          className="flex size-6 items-center justify-center rounded-[8px]"
          style={{
            background: `color-mix(in oklab, var(--${tone}) 12%, transparent)`,
            color: `var(--${tone})`,
          }}
        >
          <Icon className="size-3.5" strokeWidth={2} />
        </span>
        <span className="text-[12.5px] font-medium text-muted-foreground">{label}</span>
      </div>

      <div className="mt-2.5 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="num font-display text-[26px] font-semibold leading-none text-foreground">
            {value}
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <span
              className={cn(
                "num inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
                good === null && "bg-muted text-muted-foreground",
                good === true && "bg-positive-soft text-positive",
                good === false && "bg-critical-soft text-critical",
              )}
            >
              <DeltaIcon className="size-3" strokeWidth={2.5} />
              {delta === null ? "—" : signedPercent(delta)}
            </span>
            <span className="truncate text-[11px] text-subtle">{meta}</span>
          </div>
        </div>
        <Sparkline values={spark} tone={tone} width={78} height={30} className="shrink-0 opacity-90" />
      </div>
    </button>
  );
}

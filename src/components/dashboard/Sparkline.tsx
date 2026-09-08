import { useId } from "react";

interface Props {
  values: number[];
  tone?: "primary" | "positive" | "warning" | "critical" | "violet" | "teal";
  width?: number;
  height?: number;
  className?: string;
}

const TONE: Record<string, string> = {
  primary: "var(--primary)",
  positive: "var(--positive)",
  warning: "var(--warning)",
  critical: "var(--critical)",
  violet: "var(--violet)",
  teal: "var(--teal)",
};

export function Sparkline({ values, tone = "primary", width = 96, height = 28, className }: Props) {
  const id = useId().replace(/:/g, "");
  const color = TONE[tone] ?? TONE.primary;
  if (values.length < 2) return <svg width={width} height={height} className={className} />;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const pts = values.map((v, i) => [i * step, height - 3 - ((v - min) / span) * (height - 6)] as const);

  const path = pts
    .map(([x, y], i) => {
      if (i === 0) return `M ${x.toFixed(2)} ${y.toFixed(2)}`;
      const [px, py] = pts[i - 1]!;
      const cx = (px + x) / 2;
      return `C ${cx.toFixed(2)} ${py.toFixed(2)}, ${cx.toFixed(2)} ${y.toFixed(2)}, ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  const last = pts[pts.length - 1]!;

  return (
    <svg width={width} height={height} className={className} aria-hidden>
      <defs>
        <linearGradient id={`sf-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L ${width} ${height} L 0 ${height} Z`} fill={`url(#sf-${id})`} />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.95"
      />
      <circle cx={last[0]} cy={last[1]} r="2.4" fill={color} />
      <circle cx={last[0]} cy={last[1]} r="5" fill={color} opacity="0.16" />
    </svg>
  );
}

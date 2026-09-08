/** Restrained premium accent: layered translucent glass sphere (pure SVG/CSS). */
export function GlassOrb({ size = 108 }: { size?: number }) {
  return (
    <div
      className="pointer-events-none relative select-none"
      style={{ width: size, height: size, animation: "float-orb 9s ease-in-out infinite" }}
      aria-hidden
    >
      <svg viewBox="0 0 120 120" width={size} height={size}>
        <defs>
          <radialGradient id="orbBody" cx="35%" cy="28%" r="78%">
            <stop offset="0%" stopColor="oklch(0.98 0.02 264)" stopOpacity="0.95" />
            <stop offset="42%" stopColor="oklch(0.72 0.14 264)" stopOpacity="0.75" />
            <stop offset="100%" stopColor="oklch(0.45 0.2 276)" stopOpacity="0.92" />
          </radialGradient>
          <radialGradient id="orbGlow" cx="50%" cy="50%" r="50%">
            <stop offset="55%" stopColor="oklch(0.6 0.19 268)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="oklch(0.6 0.19 268)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="orbRing" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="oklch(0.75 0.12 200)" stopOpacity="0.85" />
            <stop offset="100%" stopColor="oklch(0.6 0.2 292)" stopOpacity="0.2" />
          </linearGradient>
          <filter id="orbBlur" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3.2" />
          </filter>
        </defs>

        <circle cx="60" cy="62" r="56" fill="url(#orbGlow)" />
        <ellipse cx="60" cy="104" rx="34" ry="6" fill="oklch(0.45 0.08 264)" opacity="0.14" filter="url(#orbBlur)" />
        <circle cx="60" cy="58" r="40" fill="url(#orbBody)" />
        <ellipse
          cx="60"
          cy="58"
          rx="52"
          ry="15"
          fill="none"
          stroke="url(#orbRing)"
          strokeWidth="1.4"
          transform="rotate(-18 60 58)"
          opacity="0.9"
        />
        <ellipse cx="47" cy="42" rx="15" ry="10" fill="oklch(1 0 0)" opacity="0.5" filter="url(#orbBlur)" transform="rotate(-24 47 42)" />
        <circle cx="60" cy="58" r="40" fill="none" stroke="oklch(1 0 0)" strokeOpacity="0.35" strokeWidth="0.8" />
      </svg>
    </div>
  );
}

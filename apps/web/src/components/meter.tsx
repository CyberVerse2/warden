/**
 * Hairline meter — used inline in tables and side panels to show
 * percent-of-cap. Eight discrete segments so you can read it at a glance
 * without bringing in a chart library or sparkline aesthetics.
 */
export function Meter({
  value,
  max,
  width = 80,
  tone = "signal",
}: {
  value: number;
  max: number;
  width?: number;
  tone?: "signal" | "deny" | "allow" | "pending";
}) {
  const pct = max <= 0 ? 0 : Math.min(1, value / max);
  const segments = 12;
  const filled = Math.round(pct * segments);
  const toneClass =
    tone === "deny"
      ? "bg-deny"
      : tone === "allow"
      ? "bg-allow"
      : tone === "pending"
      ? "bg-pending"
      : "bg-signal";
  return (
    <span
      className="inline-flex items-center gap-[2px]"
      style={{ width }}
      aria-label={`${Math.round(pct * 100)}%`}
    >
      {Array.from({ length: segments }).map((_, i) => (
        <span
          key={i}
          className={`h-[10px] flex-1 ${
            i < filled ? toneClass : "bg-hairline/60"
          }`}
        />
      ))}
    </span>
  );
}

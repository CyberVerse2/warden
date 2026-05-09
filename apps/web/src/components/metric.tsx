interface MetricProps {
  label: string;
  value: string;
  unit?: string;
  delta?: { value: string; tone: "up" | "down" | "neutral" };
  meter?: React.ReactNode;
  emphasis?: "default" | "signal" | "deny" | "pending";
}

export function Metric({
  label,
  value,
  unit,
  delta,
  meter,
  emphasis = "default",
}: MetricProps) {
  const valueColor =
    emphasis === "signal"
      ? "text-signal"
      : emphasis === "deny"
      ? "text-deny"
      : emphasis === "pending"
      ? "text-pending"
      : "text-t1";
  return (
    <div className="flex flex-col gap-2 py-5">
      <div className="flex items-center gap-3">
        <span className="label">{label}</span>
        {delta && (
          <span
            className={`label-num text-[11px] ${
              delta.tone === "up"
                ? "text-allow"
                : delta.tone === "down"
                ? "text-deny"
                : "text-t3"
            }`}
          >
            {delta.tone === "up" ? "▲" : delta.tone === "down" ? "▼" : "·"}{" "}
            {delta.value}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <span
          className={`label-num ${valueColor} text-[34px] leading-[1] tracking-[-0.025em]`}
        >
          {value}
        </span>
        {unit && (
          <span className="label-num text-t4 text-[12px]">{unit}</span>
        )}
      </div>
      {meter && <div className="mt-1">{meter}</div>}
    </div>
  );
}

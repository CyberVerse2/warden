import type { ReceiptRow } from "~/lib/queries";
import { fmtUsd } from "~/lib/format";

interface SpendPoint {
  label: string;
  allowedUsd: number;
  failedUsd: number;
  deniedUsd: number;
}

interface DecisionPoint {
  label: string;
  allow: number;
  deny: number;
  failed: number;
}

export function SpendOverTimeChart({
  receipts,
  title = "Spend over time",
}: {
  receipts: ReceiptRow[];
  title?: string;
}) {
  const points = spendPoints(receipts, 14);
  const max = Math.max(0.01, ...points.map((point) => point.allowedUsd));
  const path = linePath(points.map((point) => point.allowedUsd), max);
  const total = points.reduce((sum, point) => sum + point.allowedUsd, 0);

  return (
    <div className="border border-hairline-strong bg-bg-base/70 p-4">
      <div className="flex items-baseline justify-between gap-4">
        <span className="label">{title}</span>
        <span className="label-num text-signal text-[13px]">
          {fmtUsd(total)}
        </span>
      </div>
      <svg
        viewBox="0 0 640 180"
        role="img"
        aria-label={title}
        className="mt-4 h-[180px] w-full overflow-visible"
      >
        <g className="text-hairline-strong">
          {[0, 1, 2, 3].map((line) => (
            <line
              key={line}
              x1="0"
              x2="640"
              y1={32 + line * 36}
              y2={32 + line * 36}
              stroke="currentColor"
              strokeWidth="1"
            />
          ))}
        </g>
        <path
          d={`${path} L 620 152 L 20 152 Z`}
          fill="color-mix(in oklab, var(--signal) 14%, transparent)"
        />
        <path d={path} fill="none" stroke="var(--signal)" strokeWidth="2" />
        {points.map((point, index) => {
          const x = pointX(index, points.length);
          const y = pointY(point.allowedUsd, max);
          return (
            <g key={point.label}>
              <circle cx={x} cy={y} r="3" fill="var(--signal)" />
              {(index === 0 || index === points.length - 1 || index % 4 === 0) && (
                <text
                  x={x}
                  y="174"
                  textAnchor="middle"
                  className="fill-t4 mono text-[10px]"
                >
                  {point.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function OverviewDecisionChart({ receipts }: { receipts: ReceiptRow[] }) {
  const points = decisionPoints(receipts, 7);
  return (
    <div className="border border-hairline-strong bg-bg-base/70 p-4">
      <div className="flex items-baseline justify-between gap-4">
        <span className="label">Decision volume</span>
        <span className="label-num text-t3 text-[13px]">
          {receipts.length} receipts
        </span>
      </div>
      <StackedDecisionBars points={points} />
    </div>
  );
}

export function ReceiptDecisionChart({ receipts }: { receipts: ReceiptRow[] }) {
  const points = decisionPoints(receipts, 14);
  const totals = points.reduce(
    (sum, point) => ({
      allow: sum.allow + point.allow,
      deny: sum.deny + point.deny,
      failed: sum.failed + point.failed,
    }),
    { allow: 0, deny: 0, failed: 0 },
  );
  return (
    <div className="grid grid-cols-[1fr_260px] gap-4 border border-hairline-strong bg-bg-base/70 p-4">
      <div>
        <div className="flex items-baseline justify-between gap-4">
          <span className="label">Allowed vs failed</span>
          <span className="label-num text-t3 text-[13px]">
            {receipts.length} receipts
          </span>
        </div>
        <StackedDecisionBars points={points} />
      </div>
      <div className="grid grid-rows-3 border border-hairline">
        <DecisionStat label="Allowed" value={totals.allow} tone="allow" />
        <DecisionStat label="Denied" value={totals.deny} tone="deny" />
        <DecisionStat label="Failed" value={totals.failed} tone="pending" />
      </div>
    </div>
  );
}

function StackedDecisionBars({ points }: { points: DecisionPoint[] }) {
  const max = Math.max(1, ...points.map((point) => point.allow + point.deny + point.failed));
  return (
    <svg
      viewBox="0 0 640 170"
      role="img"
      aria-label="Receipt decisions over time"
      className="mt-4 h-[170px] w-full"
    >
      <g className="text-hairline-strong">
        {[0, 1, 2].map((line) => (
          <line
            key={line}
            x1="0"
            x2="640"
            y1={36 + line * 36}
            y2={36 + line * 36}
            stroke="currentColor"
            strokeWidth="1"
          />
        ))}
      </g>
      {points.map((point, index) => {
        const total = point.allow + point.deny + point.failed;
        const barHeight = Math.round((total / max) * 110);
        const x = 24 + index * ((640 - 48) / points.length);
        const width = Math.max(12, Math.min(28, 420 / points.length));
        const allowHeight = total === 0 ? 0 : Math.round((point.allow / total) * barHeight);
        const denyHeight = total === 0 ? 0 : Math.round((point.deny / total) * barHeight);
        const failedHeight = Math.max(0, barHeight - allowHeight - denyHeight);
        const allowY = 132 - allowHeight;
        const denyY = allowY - denyHeight;
        const failedY = denyY - failedHeight;
        return (
          <g key={point.label}>
            <rect x={x} y={22} width={width} height={110} fill="var(--bg-deep)" />
            {allowHeight > 0 && (
              <rect
                x={x}
                y={allowY}
                width={width}
                height={allowHeight}
                fill="var(--allow)"
              />
            )}
            {denyHeight > 0 && (
              <rect
                x={x}
                y={denyY}
                width={width}
                height={denyHeight}
                fill="var(--deny)"
              />
            )}
            {failedHeight > 0 && (
              <rect
                x={x}
                y={failedY}
                width={width}
                height={failedHeight}
                fill="var(--pending)"
              />
            )}
            {(index === 0 || index === points.length - 1 || index % 4 === 0) && (
              <text
                x={x + width / 2}
                y="158"
                textAnchor="middle"
                className="fill-t4 mono text-[10px]"
              >
                {point.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function DecisionStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "allow" | "deny" | "pending";
}) {
  const color =
    tone === "allow" ? "text-allow" : tone === "deny" ? "text-deny" : "text-pending";
  return (
    <div className="border-b border-hairline p-3 last:border-b-0">
      <span className="label">{label}</span>
      <span className={`label-num mt-1 block text-[20px] ${color}`}>
        {String(value).padStart(2, "0")}
      </span>
    </div>
  );
}

function spendPoints(receipts: ReceiptRow[], days: number): SpendPoint[] {
  const points = dayBuckets(days).map((bucket) => ({
    label: bucket.label,
    key: bucket.key,
    allowedUsd: 0,
    deniedUsd: 0,
    failedUsd: 0,
  }));
  const byKey = new Map(points.map((point) => [point.key, point]));
  for (const receipt of receipts) {
    const point = byKey.get(dateKey(receipt.createdAt));
    if (!point) continue;
    if (receipt.decision === "allow") point.allowedUsd += receipt.amountUsd;
    if (receipt.decision === "deny") point.deniedUsd += receipt.amountUsd;
    if (receipt.decision === "failed") point.failedUsd += receipt.amountUsd;
  }
  return points;
}

function decisionPoints(receipts: ReceiptRow[], days: number): DecisionPoint[] {
  const points = dayBuckets(days).map((bucket) => ({
    label: bucket.label,
    key: bucket.key,
    allow: 0,
    deny: 0,
    failed: 0,
  }));
  const byKey = new Map(points.map((point) => [point.key, point]));
  for (const receipt of receipts) {
    const point = byKey.get(dateKey(receipt.createdAt));
    if (!point) continue;
    point[receipt.decision] += 1;
  }
  return points;
}

function dayBuckets(days: number) {
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(start - (days - index - 1) * 86400_000);
    return {
      key: dateKey(date.getTime()),
      label: `${date.getUTCMonth() + 1}/${date.getUTCDate()}`,
    };
  });
}

function dateKey(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function pointX(index: number, count: number) {
  if (count <= 1) return 20;
  return 20 + index * (600 / (count - 1));
}

function pointY(value: number, max: number) {
  return 152 - (value / max) * 120;
}

function linePath(values: number[], max: number) {
  return values
    .map((value, index) => `${index === 0 ? "M" : "L"} ${pointX(index, values.length)} ${pointY(value, max)}`)
    .join(" ");
}

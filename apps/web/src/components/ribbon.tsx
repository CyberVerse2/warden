import { fmtUsd, shortKey } from "~/lib/format";
import { UtcClockClient } from "./clock";

interface RibbonProps {
  network: string | undefined;
  treasuryPubkey: string | undefined;
  treasuryUsd: number;
  spendTodayUsd: number;
  pending: number;
  blockedToday: number;
}

export function Ribbon({
  network,
  treasuryPubkey,
  treasuryUsd,
  spendTodayUsd,
  pending,
  blockedToday,
}: RibbonProps) {
  return (
    <div className="border-b border-hairline bg-bg-deep/60 backdrop-blur-sm">
      <div className="flex items-stretch divide-x divide-hairline text-[11px]">
        <Cell label="NETWORK">
          <span className="mono text-t1">
            {network ? network.toUpperCase() : "NO AGENTS"}
          </span>
        </Cell>
        <Cell label="TREASURY">
          <span className="mono text-t1">
            {treasuryPubkey ? shortKey(treasuryPubkey, 6, 6) : "NONE"}
          </span>
        </Cell>
        <Cell label="BALANCE">
          <span className="label-num text-t1 text-[13px]">
            {fmtUsd(treasuryUsd)}
          </span>
        </Cell>
        <Cell label="SPEND · TODAY">
          <span className="label-num text-signal text-[13px]">
            {fmtUsd(spendTodayUsd)}
          </span>
        </Cell>
        <Cell label="PENDING">
          <span className="label-num text-pending text-[13px]">
            {String(pending).padStart(2, "0")}
          </span>
        </Cell>
        <Cell label="BLOCKED · 24H">
          <span className="label-num text-deny text-[13px]">
            {String(blockedToday).padStart(2, "0")}
          </span>
        </Cell>
        <Cell label="UTC" right>
          <UtcClock />
        </Cell>
      </div>
    </div>
  );
}

function Cell({
  label,
  children,
  right,
}: {
  label: string;
  children: React.ReactNode;
  right?: boolean;
}) {
  return (
    <div
      className={`flex flex-col justify-center px-5 py-2.5 gap-0.5 ${
        right ? "ml-auto" : ""
      }`}
    >
      <span className="label">{label}</span>
      {children}
    </div>
  );
}

function UtcClock() {
  return <UtcClockClient />;
}

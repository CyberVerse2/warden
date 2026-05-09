import { Shell } from "~/components/shell";
import { Section } from "~/components/section";
import { StatusGlyph } from "~/components/status-glyph";
import { fmtRelative, fmtTime, fmtUsd, shortKey } from "~/lib/format";
import { getReceipts } from "~/lib/queries";

const FILTERS = ["ALL", "ALLOW", "DENY", "FAILED"] as const;

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ decision?: string }>;
}

export default async function ReceiptsPage({ searchParams }: Props) {
  const { decision: rawDecision } = await searchParams;
  const decision =
    rawDecision === "allow" || rawDecision === "deny" || rawDecision === "failed"
      ? rawDecision
      : undefined;
  const sorted = await getReceipts({ limit: 500, decision });
  const totalSpend = sorted
    .filter((r) => r.decision === "allow")
    .reduce((s, r) => s + r.amountUsd, 0);
  const totalBlocked = sorted
    .filter((r) => r.decision === "deny")
    .reduce((s, r) => s + r.amountUsd, 0);

  return (
    <Shell active="/receipts">
      <header className="px-8 pt-10 pb-6 border-b border-hairline">
        <span className="mono text-t4 text-[11px]">CMD · 03 / RECEIPTS</span>
        <div className="flex items-baseline justify-between">
          <h1 className="mt-2 text-[28px] tracking-[-0.025em] text-t1 font-medium">
            Receipts
          </h1>
          <a
            href={`/receipts/export${decision ? `?decision=${decision}` : ""}`}
            className="label px-4 py-2 border border-hairline-strong text-t2 hover:text-t1 hover:border-t2 transition-colors"
          >
            EXPORT JSON
          </a>
        </div>
        <p className="mt-1 text-t3 text-[13.5px] max-w-[58ch] leading-relaxed">
          Append-only ledger of every payment Warden was asked to sign. Every
          row carries a request hash and challenge hash for audit.
        </p>
      </header>

      <div className="border-b border-hairline px-8 py-4 flex items-center gap-6">
        <div className="flex items-center gap-1 border border-hairline rounded-none">
          {FILTERS.map((f, i) => (
            <a
              key={f}
              href={f === "ALL" ? "/receipts" : `/receipts?decision=${f.toLowerCase()}`}
              className={`label px-3 py-2 ${
                (f === "ALL" && !decision) || f.toLowerCase() === decision
                  ? "bg-bg-row-hover text-t1"
                  : "text-t3 hover:text-t1 hover:bg-bg-row"
              } transition-colors`}
            >
              {f}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-6 ml-auto">
          <div className="flex items-baseline gap-2">
            <span className="label">SIGNED</span>
            <span className="label-num text-t1 text-[14px]">
              {fmtUsd(totalSpend)}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="label">BLOCKED</span>
            <span className="label-num text-deny text-[14px]">
              {fmtUsd(totalBlocked)}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="label">COUNT</span>
            <span className="label-num text-t1 text-[14px]">
              {String(sorted.length).padStart(3, "0")}
            </span>
          </div>
        </div>
      </div>

      <Section code="03.00" title="Ledger" meta="newest first">
        <div className="overflow-x-auto text-[12.5px]">
          <div className="min-w-[840px]">
            <div className="grid grid-cols-[88px_22px_64px_140px_1fr_120px_100px_80px] gap-4 px-1 pb-2 border-b border-hairline-strong">
              <span className="label">UTC</span>
              <span className="label" />
              <span className="label">Decision</span>
              <span className="label">Agent</span>
              <span className="label">Target</span>
              <span className="label text-right">Amount</span>
              <span className="label">Network</span>
              <span className="label text-right">Receipt</span>
            </div>
          {sorted.map((r) => (
            <div
              key={r.id}
              className="grid grid-cols-[88px_22px_64px_140px_1fr_120px_100px_80px] gap-4 items-center py-2.5 border-b border-hairline/60 hover:bg-bg-row/40 transition-colors px-1"
            >
              <div className="flex flex-col">
                <span className="mono text-t1 text-[11.5px]">
                  {fmtTime(r.createdAt)}
                </span>
                <span className="mono text-t4 text-[10.5px]">
                  {fmtRelative(r.createdAt)}
                </span>
              </div>
              <StatusGlyph status={r.decision} showLabel={false} />
              <span
                className={`label ${
                  r.decision === "allow"
                    ? "text-allow"
                    : r.decision === "deny"
                    ? "text-deny"
                    : "text-pending"
                }`}
              >
                {r.decision === "allow"
                  ? "ALLOW"
                  : r.decision === "deny"
                  ? "DENY"
                  : "FAILED"}
              </span>
              <div className="flex flex-col">
                <span className="text-t1">{r.agentName}</span>
                <span className="mono text-t4 text-[10.5px]">
                  {shortKey(r.agentId, 4, 4)}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-t2">{r.provider}</span>
                <span className="mono text-t4 text-[10.5px] truncate">
                  {r.method} {new URL(r.url).pathname}
                </span>
              </div>
              <div className="flex flex-col items-end">
                <span className="label-num text-t1 text-[13px]">
                  {fmtUsd(r.amountUsd)}
                </span>
                <span className="mono text-t4 text-[10.5px]">{r.currency}</span>
              </div>
              <span className="mono text-t3 text-[10.5px]">
                {r.network.replace("solana-", "")}
              </span>
              <span className="mono text-t4 text-[10.5px] text-right">
                {shortKey(r.id, 3, 5)}
              </span>
            </div>
          ))}
          </div>
        </div>
      </Section>
    </Shell>
  );
}

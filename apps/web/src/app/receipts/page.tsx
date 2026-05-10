import { Shell } from "~/components/shell";
import { Section } from "~/components/section";
import { ReceiptDecisionChart } from "~/components/receipt-charts";
import { ReceiptsLedger } from "~/components/receipts-ledger";
import { fmtUsd } from "~/lib/format";
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

      <Section code="03.00" title="Receipt graph" meta="allowed · denied · failed">
        <ReceiptDecisionChart receipts={sorted} />
      </Section>

      <Section code="03.01" title="Ledger" meta="click a row to inspect">
        <div className="-mx-6 -my-5">
          <ReceiptsLedger receipts={sorted} />
        </div>
      </Section>
    </Shell>
  );
}

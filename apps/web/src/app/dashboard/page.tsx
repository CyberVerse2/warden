import { Shell } from "~/components/shell";
import { Section } from "~/components/section";
import { Metric } from "~/components/metric";
import { Meter } from "~/components/meter";
import { FeedRow } from "~/components/feed-row";
import { StatusGlyph } from "~/components/status-glyph";
import { LiveFeedStatus } from "~/components/live-feed-status";
import { fmtRelative, fmtUsd } from "~/lib/format";
import { getAgents, getApprovals, getReceipts, getSummary } from "~/lib/queries";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [s, agentRows, receipts, approvals] = await Promise.all([
    getSummary(),
    getAgents(),
    getReceipts({ limit: 12 }),
    getApprovals(),
  ]);
  const dailyCapTotal = agentRows.reduce((acc, a) => acc + a.dailyCapUsd, 0);

  return (
    <Shell active="/dashboard">
      <header className="px-8 pt-10 pb-6 border-b border-hairline">
        <div className="flex items-baseline gap-4">
          <span className="mono text-t4 text-[11px]">CMD · 00 / OVERVIEW</span>
        </div>
        <h1 className="mt-2 text-[28px] tracking-[-0.025em] text-t1 font-medium">
          Spend control
        </h1>
        <p className="mt-1 text-t3 text-[13.5px] max-w-[58ch] leading-relaxed">
          Authority remains with you. Capability sits with the agents. Every
          line below is a payment Warden either signed or refused on their
          behalf.
        </p>
      </header>

      <div className="grid grid-cols-4 divide-x divide-hairline border-b border-hairline px-2">
        <div className="px-6">
          <Metric
            label="TREASURY · POOLED"
            value={fmtUsd(s.totalBalance)}
            delta={{ value: "live · solana", tone: "neutral" }}
          />
        </div>
        <div className="px-6">
          <Metric
            label="SPEND · TODAY"
            value={fmtUsd(s.spendToday)}
            emphasis="signal"
            meter={
              <div className="flex items-center gap-2">
                <Meter value={s.spendToday} max={dailyCapTotal} />
                <span className="label-num text-t4 text-[10.5px]">
                  / {fmtUsd(dailyCapTotal)} cap
                </span>
              </div>
            }
          />
        </div>
        <div className="px-6">
          <Metric
            label="BLOCKED · 24H"
            value={String(s.blockedCount).padStart(2, "0")}
            unit={`· ${fmtUsd(s.blockedUsd)} prevented`}
            emphasis="deny"
          />
        </div>
        <div className="px-6">
          <Metric
            label="PENDING APPROVAL"
            value={String(s.pending).padStart(2, "0")}
            unit={s.pending === 1 ? "request" : "requests"}
            emphasis={s.pending > 0 ? "pending" : "default"}
          />
        </div>
      </div>

      <div className="grid grid-cols-[1fr_360px] divide-x divide-hairline">
        <Section
          code="00.01"
          title="Live activity"
          meta={`${receipts.length} most recent · streaming`}
        >
          <div className="overflow-x-auto">
            <div className="min-w-[680px]">
              <div className="grid grid-cols-[78px_22px_140px_1fr_88px_72px] gap-4 px-1 pb-2 border-b border-hairline-strong">
                <span className="label">UTC</span>
                <span className="label" />
                <span className="label">Agent</span>
                <span className="label">Target</span>
                <span className="label text-right">Amount</span>
                <span className="label text-right">Receipt</span>
              </div>
              <div>
                {receipts.map((r) => (
                  <FeedRow key={r.id} r={r} />
                ))}
              </div>
            </div>
          </div>
          <LiveFeedStatus />
        </Section>

        <Section
          code="00.02"
          title="Agents"
          meta={`${agentRows.filter((a) => a.status === "active").length}/${agentRows.length} active`}
        >
          <div className="flex flex-col gap-0">
            {agentRows.map((a) => {
              const pct = a.dailyCapUsd === 0 ? 0 : a.spentTodayUsd / a.dailyCapUsd;
              return (
                <a
                  href={`/agents/${a.id}`}
                  key={a.id}
                  className="group flex flex-col gap-2 py-3 border-b border-hairline/60 last:border-b-0 hover:bg-bg-row/40 transition-colors px-1"
                >
                  <div className="flex items-center gap-2">
                    <StatusGlyph status={a.status} showLabel={false} />
                    <span className="text-t1 text-[13px] truncate">
                      {a.name}
                    </span>
                    <span className="ml-auto label-num text-t3 text-[11px]">
                      {a.lastActivityAt > 0 ? fmtRelative(a.lastActivityAt) : "—"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Meter
                      value={a.spentTodayUsd}
                      max={a.dailyCapUsd}
                      width={140}
                      tone={pct > 0.85 ? "deny" : pct > 0.6 ? "pending" : "signal"}
                    />
                    <span className="label-num text-t3 text-[11px]">
                      {fmtUsd(a.spentTodayUsd)} / {fmtUsd(a.dailyCapUsd)}
                    </span>
                  </div>
                </a>
              );
            })}
          </div>
        </Section>
      </div>

      {approvals.length > 0 && (
        <Section
          code="00.03"
          title="Awaiting decision"
          meta={`${approvals.length} ${
            approvals.length === 1 ? "request" : "requests"
          } · oldest ${fmtRelative(
            Math.min(...approvals.map((a) => a.createdAt)),
          )}`}
          action={
            <a
              href="/approvals"
              className="label text-signal hover:text-t1 transition-colors"
            >
              REVIEW QUEUE →
            </a>
          }
        >
          <div className="flex flex-col">
            {approvals.map((a) => (
              <div
                key={a.id}
                className="grid grid-cols-[140px_1fr_120px_120px_140px] items-center gap-4 py-3 border-b border-hairline/60 last:border-b-0 px-1 text-[13px]"
              >
                <span className="text-t1">{a.agentName}</span>
                <span className="text-t3 truncate">
                  <span className="text-t2">{a.provider}</span>
                  <span className="text-t4">
                    {" · "}
                    {a.url ? new URL(a.url).pathname : ""}
                  </span>
                </span>
                <span className="label-num text-pending text-[14px]">
                  {fmtUsd(a.amountUsd)}
                </span>
                <span className="mono text-t4 text-[11px]">
                  {fmtRelative(a.createdAt)}
                </span>
                <div className="flex justify-end gap-2">
                  <a
                    href="/approvals"
                    className="label px-3 py-1.5 border border-hairline-strong text-t2 hover:text-deny hover:border-deny transition-colors"
                  >
                    REVIEW
                  </a>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </Shell>
  );
}

import Link from "next/link";
import { Shell } from "~/components/shell";
import { Section } from "~/components/section";
import { Meter } from "~/components/meter";
import { StatusGlyph } from "~/components/status-glyph";
import { fmtRelative, fmtUsd, shortKey } from "~/lib/format";
import { getAgents } from "~/lib/queries";
import { createAgent } from "./actions";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const agents = await getAgents();
  return (
    <Shell active="/agents">
      <header className="px-8 pt-10 pb-6 border-b border-hairline">
        <span className="mono text-t4 text-[11px]">CMD · 01 / AGENTS</span>
        <div className="flex items-baseline justify-between">
          <h1 className="mt-2 text-[28px] tracking-[-0.025em] text-t1 font-medium">
            Agents
          </h1>
          <form action={createAgent} className="flex items-center gap-2">
            <input
              name="name"
              placeholder="Agent name"
              className="bg-bg-base border border-hairline-strong px-3 py-2 text-[13px] text-t1 outline-none"
            />
            <input type="hidden" name="network" value="solana-devnet" />
            <button className="label px-4 py-2 border border-signal-dim text-signal hover:bg-signal hover:text-bg-base hover:border-signal transition-colors">
              + NEW AGENT
            </button>
          </form>
        </div>
        <p className="mt-1 text-t3 text-[13.5px] max-w-[58ch] leading-relaxed">
          Each agent has its own wallet, policy, and audit trail. Revocation is
          immediate and irreversible.
        </p>
      </header>

      <Section code="01.00" title="Roster" meta={`${agents.length} agents`}>
        <div className="text-[13px]">
          <div className="grid grid-cols-[24px_220px_180px_1fr_180px_120px] gap-4 px-1 pb-2 border-b border-hairline-strong">
            <span className="label" />
            <span className="label">Agent</span>
            <span className="label">Wallet</span>
            <span className="label">Daily spend</span>
            <span className="label">Risk · policy</span>
            <span className="label text-right">Last activity</span>
          </div>
          {agents.map((a) => {
            const pct = a.dailyCapUsd === 0 ? 0 : a.spentTodayUsd / a.dailyCapUsd;
            return (
              <Link
                href={`/agents/${a.id}`}
                key={a.id}
                className="group grid grid-cols-[24px_220px_180px_1fr_180px_120px] gap-4 items-center px-1 py-3.5 border-b border-hairline/60 hover:bg-bg-row/40 transition-colors"
              >
                <StatusGlyph status={a.status} showLabel={false} />
                <div className="flex flex-col">
                  <span className="text-t1">{a.name}</span>
                  <span className="mono text-t4 text-[11px]">{a.id}</span>
                </div>
                <div className="flex flex-col">
                  <span className="mono text-t2 text-[12px]">
                    {shortKey(a.publicKey, 6, 6)}
                  </span>
                  <span className="label-num text-t1 text-[12.5px]">
                    {fmtUsd(a.balanceUsd)}{" "}
                    <span className="text-t4">balance</span>
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Meter
                    value={a.spentTodayUsd}
                    max={a.dailyCapUsd}
                    width={120}
                    tone={pct > 0.85 ? "deny" : pct > 0.6 ? "pending" : "signal"}
                  />
                  <span className="label-num text-t3 text-[12px]">
                    <span className="text-t1">{fmtUsd(a.spentTodayUsd)}</span>{" "}
                    / {fmtUsd(a.dailyCapUsd)}
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span
                    className={`mono text-[10.5px] ${
                      a.status === "revoked"
                        ? "text-deny"
                        : a.policy.allowedHosts.length === 0
                        ? "text-deny"
                        : "text-allow"
                    }`}
                  >
                    {a.status === "revoked"
                      ? "✕"
                      : a.policy.allowedHosts.length === 0
                      ? "○"
                      : "●"}
                  </span>
                  <span className="text-t2 truncate">
                    {a.status === "revoked"
                      ? "Revoked"
                      : a.policy.allowedHosts.length === 0
                      ? "Deny-all"
                      : `${a.policy.allowedHosts.length} hosts · ${fmtUsd(
                          a.policy.maxUsdPerRequest,
                        )}/req`}
                  </span>
                </div>
                <span className="mono text-t3 text-right text-[11px]">
                  {a.lastActivityAt > 0 ? fmtRelative(a.lastActivityAt) : "—"}
                </span>
              </Link>
            );
          })}
        </div>
      </Section>
    </Shell>
  );
}

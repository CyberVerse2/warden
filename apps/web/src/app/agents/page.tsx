import Link from "next/link";
import { CELO_SEPOLIA_NETWORK } from "@warden/core";
import { Shell } from "~/components/shell";
import { Section } from "~/components/section";
import { Meter } from "~/components/meter";
import { StatusGlyph } from "~/components/status-glyph";
import { CopyButton } from "~/components/copy-button";
import { fmtRelative, fmtUsd, shortKey } from "~/lib/format";
import { getAgents } from "~/lib/queries";

export const dynamic = "force-dynamic";

function fmtToken(n: number, symbol: string): string {
  return `${n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: n === 0 ? 0 : 4,
  })} ${symbol}`;
}

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
          <form
            action="/agents/create"
            method="post"
            className="flex items-center gap-2"
          >
            <input
              name="name"
              placeholder="Agent name"
              className="bg-bg-base border border-hairline-strong px-3 py-2 text-[13px] text-t1 outline-none"
            />
            <input
              name="dailyBudgetUsd"
              type="number"
              min="0"
              step="0.01"
              defaultValue="5"
              aria-label="Daily budget in USD"
              className="w-24 bg-bg-base border border-hairline-strong px-3 py-2 label-num text-[13px] text-t1 outline-none"
            />
            <select
              name="riskPosture"
              aria-label="Risk posture"
              defaultValue="balanced"
              className="bg-bg-base border border-hairline-strong px-3 py-2 text-[13px] text-t1 outline-none"
            >
              <option value="conservative">Conservative</option>
              <option value="balanced">Balanced</option>
              <option value="aggressive">Aggressive</option>
            </select>
            <input
              name="purpose"
              placeholder="Purpose"
              defaultValue="General x402 spend"
              className="bg-bg-base border border-hairline-strong px-3 py-2 text-[13px] text-t1 outline-none"
            />
            <input type="hidden" name="network" value={CELO_SEPOLIA_NETWORK} />
            <button className="label px-4 py-2 border border-signal-dim text-signal hover:bg-signal hover:text-bg-base hover:border-signal transition-colors">
              + NEW AGENT
            </button>
          </form>
        </div>
        <p className="mt-1 text-t3 text-[13.5px] max-w-[58ch] leading-relaxed">
          Set a daily budget and risk posture. Warden handles provider
          decisions by default; manual host rules stay available in advanced
          policy.
        </p>
      </header>

      <Section code="01.00" title="Roster" meta={`${agents.length} agents`}>
        <div className="text-[13px]">
          <div className="grid grid-cols-[24px_220px_180px_1fr_180px_120px] gap-4 px-1 pb-2 border-b border-hairline-strong">
            <span className="label" />
            <span className="label">Agent</span>
            <span className="label">Wallet</span>
            <span className="label">Daily spend</span>
            <span className="label">Budget · posture</span>
            <span className="label text-right">Last activity</span>
          </div>
          {agents.map((a) => {
            const pct = a.dailyCapUsd === 0 ? 0 : a.spentTodayUsd / a.dailyCapUsd;
            return (
              <div
                key={a.id}
                className="group relative grid grid-cols-[24px_220px_180px_1fr_180px_120px] gap-4 items-center px-1 py-3.5 border-b border-hairline/60 hover:bg-bg-row/40 transition-colors"
              >
                <Link
                  href={`/agents/${a.id}`}
                  aria-label={`Open ${a.name}`}
                  className="absolute inset-0 z-10"
                />
                <StatusGlyph status={a.status} showLabel={false} />
                <div className="flex flex-col">
                  <span className="text-t1">{a.name}</span>
                  <span className="mono text-t4 text-[11px]">{a.id}</span>
                </div>
                <div className="flex flex-col">
                  <div className="relative z-20 flex items-center gap-2">
                    <span className="mono text-t2 text-[12px]">
                      {shortKey(a.publicKey, 6, 6)}
                    </span>
                    <CopyButton text={a.publicKey} />
                  </div>
                  <span className="label-num text-t1 text-[12.5px]">
                    {fmtToken(a.celoBalance, "CELO")}{" "}
                    <span className="text-t4">·</span>{" "}
                    {fmtUsd(a.usdcBalance)}{" "}
                    <span className="text-t4">USDC</span>
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
                        : a.policy.mode === "managed"
                        ? "text-signal"
                        : a.policy.allowedHosts.length === 0
                        ? "text-pending"
                        : "text-allow"
                    }`}
                  >
                    {a.status === "revoked"
                      ? "✕"
                      : a.policy.mode === "managed"
                      ? "●"
                      : a.policy.allowedHosts.length === 0
                      ? "○"
                      : "●"}
                  </span>
                  <span className="text-t2 truncate">
                    {a.status === "revoked"
                      ? "Revoked"
                      : a.policy.mode === "managed"
                      ? `${a.policy.riskPosture} · managed`
                      : a.policy.allowedHosts.length === 0
                      ? "open hosts"
                      : `${a.policy.allowedHosts.length} hosts · ${fmtUsd(
                          a.policy.maxUsdPerRequest,
                        )}/req`}
                  </span>
                </div>
                <span className="mono text-t3 text-right text-[11px]">
                  {a.lastActivityAt > 0 ? fmtRelative(a.lastActivityAt) : "—"}
                </span>
              </div>
            );
          })}
        </div>
      </Section>
    </Shell>
  );
}

import { notFound } from "next/navigation";
import { discoverPayServices } from "@warden/x402";
import { Shell } from "~/components/shell";
import { Section } from "~/components/section";
import { Meter } from "~/components/meter";
import { Metric } from "~/components/metric";
import { StatusGlyph } from "~/components/status-glyph";
import { FeedRow } from "~/components/feed-row";
import { MCPSnippets } from "~/components/mcp-snippets";
import { ConfirmSubmitButton } from "~/components/confirm-submit-button";
import { fmtRelative, fmtUsd, shortKey } from "~/lib/format";
import { getOrigin } from "~/lib/origin";
import { getAgent, getApprovals, getReceipts } from "~/lib/queries";
import {
  airdropDevnetSol,
  revokeAgent,
  rotateAgentToken,
  updatePolicy,
} from "../actions";

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function AgentDetailPage({ params }: Props) {
  const { id } = await params;
  const [agent, allReceipts, pending, origin, payServices] = await Promise.all([
    getAgent(id),
    getReceipts({ agentId: id, limit: 100 }),
    getApprovals({ agentId: id }),
    getOrigin(),
    discoverPayServices({ query: "x402", limit: 24 }).catch(() => []),
  ]);
  if (!agent) return notFound();
  const pct = agent.dailyCapUsd === 0 ? 0 : agent.spentTodayUsd / agent.dailyCapUsd;
  const mcpUrl = `${origin}/api/mcp/${agent.id}`;
  const providerHosts = new Set(
    payServices.map((service) => new URL(service.serviceUrl).host),
  );
  const customAllowedHosts = agent.policy.allowedHosts.filter(
    (host) => !providerHosts.has(host),
  );

  return (
    <Shell active="/agents">
      <header className="px-8 pt-10 pb-6 border-b border-hairline">
        <div className="flex items-baseline gap-3">
          <a href="/agents" className="mono text-t4 text-[11px] hover:text-t2">
            ← AGENTS
          </a>
          <span className="mono text-t4 text-[11px]">/ {agent.id}</span>
        </div>
        <div className="mt-2 flex items-center gap-4">
          <StatusGlyph status={agent.status} showLabel={false} />
          <h1 className="text-[28px] tracking-[-0.025em] text-t1 font-medium">
            {agent.name}
          </h1>
          <span className="label">
            {agent.status === "active" ? "ACTIVE" : "REVOKED"}
          </span>
          <div className="ml-auto flex gap-2">
            {agent.network === "solana-devnet" && (
              <form action={airdropDevnetSol.bind(null, agent.id)}>
                <ConfirmSubmitButton
                  confirm={`Request 2 devnet SOL for ${agent.name}?`}
                  className="label px-4 py-2 border border-hairline-strong text-t2 hover:text-t1 hover:border-t2 transition-colors"
                >
                  AIRDROP 2 SOL
                </ConfirmSubmitButton>
              </form>
            )}
            <form action={revokeAgent.bind(null, agent.id)}>
              <ConfirmSubmitButton
                confirm={`Revoke ${agent.name}? This revokes the agent wallet and all agent tokens.`}
                className="label px-4 py-2 border border-deny-dim text-deny hover:bg-deny hover:text-bg-base transition-colors"
              >
                REVOKE
              </ConfirmSubmitButton>
            </form>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-4 gap-px bg-hairline">
          <Identity label="WALLET" value={shortKey(agent.publicKey, 8, 8)} mono />
          <Identity label="NETWORK" value={agent.network.toUpperCase()} mono />
          <Identity label="BALANCE" value={fmtUsd(agent.balanceUsd)} />
          <Identity
            label="MCP TOKEN"
            value="●●●●●●●●●●●●●●●●"
            mono
            action={rotateAgentToken.bind(null, agent.id)}
          />
        </div>
      </header>

      <div className="grid grid-cols-3 divide-x divide-hairline border-b border-hairline px-2">
        <div className="px-6">
          <Metric
            label="SPENT · TODAY"
            value={fmtUsd(agent.spentTodayUsd)}
            emphasis="signal"
            meter={
              <div className="flex items-center gap-2">
                <Meter
                  value={agent.spentTodayUsd}
                  max={agent.dailyCapUsd}
                  tone={pct > 0.85 ? "deny" : pct > 0.6 ? "pending" : "signal"}
                />
                <span className="label-num text-t4 text-[10.5px]">
                  / {fmtUsd(agent.dailyCapUsd)} cap
                </span>
              </div>
            }
          />
        </div>
        <div className="px-6">
          <Metric
            label="ALLOWED · 24H"
            value={String(
              allReceipts.filter(
                (r) =>
                  r.decision === "allow" && r.createdAt > Date.now() - 86400_000,
              ).length,
            ).padStart(2, "0")}
            unit="payments signed"
          />
        </div>
        <div className="px-6">
          <Metric
            label="DENIED · 24H"
            value={String(
              allReceipts.filter(
                (r) =>
                  r.decision === "deny" && r.createdAt > Date.now() - 86400_000,
              ).length,
            ).padStart(2, "0")}
            unit="blocked at policy"
            emphasis="deny"
          />
        </div>
      </div>

      <div className="grid grid-cols-[1fr_400px] divide-x divide-hairline">
        <Section
          code="01.A"
          title="Recent activity"
          meta={`${allReceipts.length} receipts`}
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
              {allReceipts.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-t3 text-[13px]">
                    No activity yet. Connect this agent through MCP and call{" "}
                    <code className="mono text-signal">warden_fetch</code>.
                  </p>
                </div>
              ) : (
                allReceipts.map((r) => <FeedRow key={r.id} r={r} />)
              )}
            </div>
          </div>
        </Section>

        <Section
          id="policy"
          code="01.B"
          title="Active policy"
          meta="v1 · activated"
        >
          <div className="flex flex-col gap-0">
            <PolicyRow label="Allowed hosts" rule="policy.allowedHosts">
              {agent.policy.allowedHosts.length === 0 ? (
                <span className="text-deny mono text-[12.5px]">○ deny-all</span>
              ) : (
                <ul className="flex flex-col gap-1">
                  {agent.policy.allowedHosts.map((h) => (
                    <li
                      key={h}
                      className="mono text-t1 text-[12.5px] flex items-center gap-2"
                    >
                      <span className="text-allow">●</span> {h}
                    </li>
                  ))}
                </ul>
              )}
            </PolicyRow>
            <PolicyRow label="Networks" rule="policy.allowedNetworks">
              <span className="mono text-t1 text-[12.5px]">
                {agent.policy.allowedNetworks.join(" · ")}
              </span>
            </PolicyRow>
            <PolicyRow label="Tokens" rule="policy.allowedTokens">
              <span className="mono text-t1 text-[12.5px]">
                {agent.policy.allowedTokens.join(" · ")}
              </span>
            </PolicyRow>
            <PolicyRow label="Per-request cap" rule="policy.maxUsdPerRequest">
              <span className="label-num text-t1 text-[14px]">
                {fmtUsd(agent.policy.maxUsdPerRequest)}
              </span>
            </PolicyRow>
            <PolicyRow label="Daily cap" rule="policy.maxUsdPerDay">
              <span className="label-num text-t1 text-[14px]">
                {fmtUsd(agent.policy.maxUsdPerDay)}
              </span>
            </PolicyRow>
            {agent.policy.approvalThresholdUsd !== undefined && (
              <PolicyRow
                label="Approval threshold"
                rule="policy.approvalThresholdUsd"
              >
                <span className="label-num text-pending text-[14px]">
                  ≥ {fmtUsd(agent.policy.approvalThresholdUsd)}
                </span>
              </PolicyRow>
            )}
          </div>

          {pending.length > 0 && (
            <div className="mt-8 pt-6 border-t border-hairline">
              <span className="label">PENDING REQUESTS · {pending.length}</span>
              <div className="mt-3 flex flex-col gap-2">
                {pending.map((p) => (
                  <a
                    href="/approvals"
                    key={p.id}
                    className="flex items-baseline gap-3 py-2 hover:bg-bg-row/40 px-1 transition-colors"
                  >
                    <span className="label-num text-pending text-[14px]">
                      {fmtUsd(p.amountUsd)}
                    </span>
                    <span className="text-t2 text-[12.5px] truncate">
                      {p.provider}
                    </span>
                    <span className="ml-auto mono text-t4 text-[11px]">
                      {fmtRelative(p.createdAt)}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}

          <form
            action={updatePolicy.bind(null, agent.id)}
            className="mt-8 pt-6 border-t border-hairline flex flex-col gap-3"
          >
            <span className="label">EDIT POLICY</span>
            <Field label="Allowed x402 providers">
              {payServices.length === 0 ? (
                <p className="text-t3 text-[12.5px] leading-relaxed">
                  Provider catalog unavailable. Use custom hosts below.
                </p>
              ) : (
                <div className="max-h-[280px] overflow-auto border border-hairline-strong divide-y divide-hairline">
                  {payServices.map((service) => {
                    const host = new URL(service.serviceUrl).host;
                    return (
                      <label
                        key={service.fqn}
                        className="grid grid-cols-[18px_1fr_auto] gap-3 px-3 py-3 hover:bg-bg-row/40 transition-colors cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          name="allowedHosts"
                          value={host}
                          defaultChecked={agent.policy.allowedHosts.includes(host)}
                          className="mt-0.5 size-3 accent-[var(--signal)]"
                        />
                        <span className="min-w-0">
                          <span className="block text-t1 text-[13px] truncate">
                            {service.title}
                          </span>
                          <span className="block mono text-t4 text-[11px] truncate">
                            {host}
                          </span>
                        </span>
                        <span className="label-num text-t4 text-[11px] whitespace-nowrap">
                          {fmtUsd(service.minPriceUsd)}
                          {service.maxPriceUsd !== service.minPriceUsd
                            ? `-${fmtUsd(service.maxPriceUsd)}`
                            : ""}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </Field>
            <Field label="Custom hosts">
              <input
                name="customAllowedHosts"
                defaultValue={customAllowedHosts.join(", ")}
                placeholder="api.example.com, x402.example.com"
                className="w-full bg-bg-base border border-hairline-strong px-3 py-2 mono text-[12px] text-t1 outline-none"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Per request cap">
                <input
                  name="maxUsdPerRequest"
                  type="number"
                  step="0.000001"
                  min="0"
                  defaultValue={agent.policy.maxUsdPerRequest}
                  className="w-full bg-bg-base border border-hairline-strong px-3 py-2 label-num text-[12px] text-t1 outline-none"
                />
              </Field>
              <Field label="Daily cap">
                <input
                  name="maxUsdPerDay"
                  type="number"
                  step="0.000001"
                  min="0"
                  defaultValue={agent.policy.maxUsdPerDay}
                  className="w-full bg-bg-base border border-hairline-strong px-3 py-2 label-num text-[12px] text-t1 outline-none"
                />
              </Field>
            </div>
            <Field label="Approval threshold">
              <input
                name="approvalThresholdUsd"
                type="number"
                step="0.000001"
                min="0"
                defaultValue={agent.policy.approvalThresholdUsd ?? ""}
                className="w-full bg-bg-base border border-hairline-strong px-3 py-2 label-num text-[12px] text-t1 outline-none"
              />
            </Field>
            {agent.policy.allowedNetworks.map((n) => (
              <input key={n} type="hidden" name="allowedNetworks" value={n} />
            ))}
            {agent.policy.allowedTokens.map((t) => (
              <input key={t} type="hidden" name="allowedTokens" value={t} />
            ))}
            {agent.policy.allowedMethods.map((m) => (
              <input key={m} type="hidden" name="allowedMethods" value={m} />
            ))}
            <button className="label px-4 py-2 border border-signal-dim text-signal hover:bg-signal hover:text-bg-base hover:border-signal transition-colors">
              SAVE POLICY
            </button>
          </form>
        </Section>
      </div>

      <Section
        code="01.C"
        title="MCP connection"
        meta="streamable HTTP · Bearer auth"
      >
        <MCPSnippets
          agentId={agent.id}
          agentName={agent.name}
          url={mcpUrl}
        />
      </Section>
    </Shell>
  );
}

function Identity({
  label,
  value,
  mono,
  action,
}: {
  label: string;
  value: string;
  mono?: boolean;
  action?: string | (() => Promise<void>);
}) {
  return (
    <div className="bg-bg-base px-4 py-3 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="label">{label}</span>
        {typeof action === "function" ? (
          <form action={action}>
            <ConfirmSubmitButton
              confirm="Rotate this MCP token? The current token will stop working immediately."
              className="label text-signal hover:text-t1 transition-colors"
            >
              ROTATE
            </ConfirmSubmitButton>
          </form>
        ) : action ? (
          <button className="label text-signal hover:text-t1 transition-colors">
            {action}
          </button>
        ) : null}
      </div>
      <span className={`text-t1 text-[13px] ${mono ? "mono" : "label-num"}`}>
        {value}
      </span>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

function PolicyRow({
  label,
  rule,
  children,
}: {
  label: string;
  rule: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 py-3 border-b border-hairline/60 last:border-b-0">
      <div className="flex items-baseline justify-between">
        <span className="text-t2 text-[12.5px]">{label}</span>
        <span className="mono text-t4 text-[10.5px]">{rule}</span>
      </div>
      <div>{children}</div>
    </div>
  );
}

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
import { CopyButton } from "~/components/copy-button";
import { fmtRelative, fmtUsd, shortKey } from "~/lib/format";
import { getOrigin } from "~/lib/origin";
import { getAgent, getApprovals, getReceipts } from "~/lib/queries";
import {
  airdropDevnetSol,
  revokeAgent,
  rotateAgentToken,
  switchAgentNetwork,
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
  const mcpSlug = agent.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const tokenValue = "<YOUR_AGENT_TOKEN>";
  const codexConfig = `[mcp_servers.warden-${mcpSlug}]\nurl = "${mcpUrl}"\nheaders = { Authorization = "Bearer ${tokenValue}" }\n`;
  const claudeConfig = JSON.stringify(
    {
      mcpServers: {
        [`warden-${mcpSlug}`]: {
          type: "http",
          url: mcpUrl,
          headers: { Authorization: `Bearer ${tokenValue}` },
        },
      },
    },
    null,
    2,
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
            <a
              href={`/agents/${agent.id}/chat`}
              className="label px-4 py-2 border border-signal-dim text-signal hover:bg-signal hover:text-bg-base hover:border-signal transition-colors"
            >
              OPEN CHAT
            </a>
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
          <div className="bg-bg-base p-4">
            <span className="label">NETWORK</span>
            <form
              action={switchAgentNetwork.bind(null, agent.id)}
              className="mt-2 grid grid-cols-2 border border-hairline-strong"
            >
              {[
                ["solana-mainnet", "MAINNET"],
                ["solana-devnet", "DEVNET"],
              ].map(([network, label]) => {
                const active = agent.network === network;
                return (
                  <button
                    key={network}
                    name="network"
                    value={network}
                    disabled={active}
                    className={`mono px-3 py-2 text-[11px] transition-colors ${
                      active
                        ? "bg-signal text-bg-base"
                        : "text-t3 hover:text-t1 hover:bg-bg-row/50"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </form>
          </div>
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
          title="Control"
          meta={`${agent.policy.mode} · v1`}
        >
          <div className="flex flex-col gap-8">
            <div>
              <div className="grid grid-cols-2 border border-hairline-strong">
                <PolicyTile
                  label="Mode"
                  value={agent.policy.mode.toUpperCase()}
                  tone="signal"
                />
                <PolicyTile
                  label="Daily cap"
                  value={fmtUsd(agent.policy.maxUsdPerDay)}
                />
                <PolicyTile
                  label="Per request"
                  value={fmtUsd(agent.policy.maxUsdPerRequest)}
                />
                <PolicyTile
                  label="Risk"
                  value={(agent.policy.riskPosture ?? "balanced").toUpperCase()}
                />
                <PolicyTile
                  label="Network"
                  value={agent.policy.allowedNetworks.join(" · ")}
                />
                <PolicyTile
                  label="Token"
                  value={agent.policy.allowedTokens.join(" · ")}
                />
              </div>
              <div className="mt-4 flex flex-col gap-3 border-b border-hairline pb-4">
                <CompactPolicyLine label="Hosts">
                  {agent.policy.mode === "managed" ? (
                    <span className="text-signal">
                      Warden-managed provider decisions
                    </span>
                  ) : agent.policy.allowedHosts.length === 0 ? (
                    <span className="text-pending">unrestricted by host</span>
                  ) : (
                    <span>{agent.policy.allowedHosts.length} allowed hosts</span>
                  )}
                </CompactPolicyLine>
                {agent.policy.approvalThresholdUsd !== undefined && (
                  <CompactPolicyLine label="Approval">
                    ≥ {fmtUsd(agent.policy.approvalThresholdUsd)}
                  </CompactPolicyLine>
                )}
                {agent.policy.purpose && (
                  <CompactPolicyLine label="Purpose">
                    {agent.policy.purpose}
                  </CompactPolicyLine>
                )}
              </div>
            </div>

            <div className="border border-hairline-strong bg-bg-deep/35 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <span className="label">MCP CONNECTION</span>
                  <code className="mono mt-2 block text-t1 text-[12px] break-all">
                    {mcpUrl}
                  </code>
                </div>
                <CopyButton text={mcpUrl} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <CopyButton text={codexConfig} label="COPY CODEX" />
                <CopyButton text={claudeConfig} label="COPY CLAUDE" />
              </div>
              <p className="mt-3 text-t4 text-[11.5px] leading-relaxed">
                Uses bearer auth. Rotate the MCP token above if you need a fresh
                token before pasting the config.
              </p>
            </div>

            {pending.length > 0 && (
              <div>
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

            <details className="group border-t border-hairline pt-5">
              <summary className="label flex cursor-pointer list-none items-center justify-between text-signal hover:text-t1">
                EDIT MANAGED POLICY
                <span className="mono text-[13px] text-t4 group-open:rotate-45 transition-transform">
                  +
                </span>
              </summary>
              <form
                action={updatePolicy.bind(null, agent.id)}
                className="mt-4 flex flex-col gap-3"
              >
                <p className="text-t3 text-[12.5px] leading-relaxed">
                  Set the spend envelope. Warden handles provider decisions and
                  only escalates high-risk requests.
                </p>
                <input type="hidden" name="policyMode" value="managed" />
                <input type="hidden" name="network" value={agent.network} />
                <Field label="Daily budget">
                  <input
                    name="dailyBudgetUsd"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={agent.policy.maxUsdPerDay}
                    className="w-full bg-bg-base border border-hairline-strong px-3 py-2 label-num text-[12px] text-t1 outline-none"
                  />
                </Field>
                <Field label="Risk posture">
                  <select
                    name="riskPosture"
                    defaultValue={agent.policy.riskPosture ?? "balanced"}
                    className="w-full bg-bg-base border border-hairline-strong px-3 py-2 text-[12px] text-t1 outline-none"
                  >
                    <option value="conservative">Conservative</option>
                    <option value="balanced">Balanced</option>
                    <option value="aggressive">Aggressive</option>
                  </select>
                </Field>
                <Field label="Agent purpose">
                  <input
                    name="purpose"
                    defaultValue={agent.policy.purpose ?? "General x402 spend"}
                    className="w-full bg-bg-base border border-hairline-strong px-3 py-2 text-[12px] text-t1 outline-none"
                  />
                </Field>
                <button className="label px-4 py-2 border border-signal-dim text-signal hover:bg-signal hover:text-bg-base hover:border-signal transition-colors">
                  SAVE MANAGED POLICY
                </button>
              </form>
            </details>

            <details className="group border-t border-hairline pt-5">
              <summary className="label flex cursor-pointer list-none items-center justify-between text-t3 hover:text-t1">
                ADVANCED HOST RULES
                <span className="mono text-[13px] text-t4 group-open:rotate-45 transition-transform">
                  +
                </span>
              </summary>
              <form
                action={updatePolicy.bind(null, agent.id)}
                className="mt-4 flex flex-col gap-3"
              >
                <p className="text-t3 text-[12.5px] leading-relaxed">
                  Use manual host rules only when this agent needs a strict
                  provider allowlist.
                </p>
                <input type="hidden" name="policyMode" value="advanced" />
                <Field label="Allowed x402 providers">
                  {payServices.length === 0 ? (
                    <p className="text-t3 text-[12.5px] leading-relaxed">
                      Provider catalog unavailable. Use custom hosts below.
                    </p>
                  ) : (
                    <div className="max-h-[220px] overflow-auto border border-hairline-strong divide-y divide-hairline">
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
                <input
                  type="hidden"
                  name="riskPosture"
                  value={agent.policy.riskPosture ?? "balanced"}
                />
                <input
                  type="hidden"
                  name="purpose"
                  value={agent.policy.purpose ?? "Advanced x402 policy"}
                />
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
                  SAVE ADVANCED POLICY
                </button>
              </form>
            </details>
          </div>
        </Section>
      </div>

      <Section
        code="01.C"
        title="Full MCP setup"
        meta="reference"
      >
        <details className="group border border-hairline-strong bg-bg-deep/25 p-5">
          <summary className="label flex cursor-pointer list-none items-center justify-between text-t2 hover:text-t1">
            SHOW ALL CLIENT SNIPPETS
            <span className="mono text-[13px] text-t4 group-open:rotate-45 transition-transform">
              +
            </span>
          </summary>
          <div className="mt-5">
            <MCPSnippets
              agentId={agent.id}
              agentName={agent.name}
              url={mcpUrl}
            />
          </div>
        </details>
      </Section>
    </Shell>
  );
}

function PolicyTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "signal";
}) {
  return (
    <div className="border-b border-r border-hairline p-3 even:border-r-0 last:border-b-0 [&:nth-last-child(2)]:border-b-0">
      <span className="label">{label}</span>
      <span
        className={`mono mt-1 block truncate text-[12.5px] ${
          tone === "signal" ? "text-signal" : "text-t1"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function CompactPolicyLine({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[92px_1fr] gap-3 text-[12.5px]">
      <span className="label pt-px">{label}</span>
      <span className="min-w-0 truncate text-t2">{children}</span>
    </div>
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

import "server-only";
import { agents, approvals, policies, receipts, spendWindows, wallets } from "@warden/db";
import { PolicyConfigSchema, type PolicyConfig } from "@warden/core";
import { createWalletService } from "@warden/wallet";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getCurrentUser } from "./auth";
import { getDb } from "./db";
import { requireEnv } from "./env";

export interface AgentRow {
  id: string;
  name: string;
  status: "active" | "revoked";
  publicKey: string;
  network: "solana-mainnet" | "solana-devnet";
  balanceUsd: number;
  spentTodayUsd: number;
  dailyCapUsd: number;
  lastActivityAt: number;
  policy: PolicyConfig;
}

export interface ReceiptRow {
  id: string;
  agentId: string;
  agentName: string;
  provider: string;
  url: string;
  method: string;
  amountUsd: number;
  currency: "USDC" | "SOL" | "UNPAID";
  network: string;
  decision: "allow" | "deny" | "failed";
  decisionReason: string;
  responseStatus: number;
  txSignature: string | undefined;
  createdAt: number;
}

export interface ApprovalRow {
  id: string;
  agentId: string;
  agentName: string;
  provider: string;
  url: string;
  amountUsd: number;
  triggeringRule: string;
  reason: string;
  createdAt: number;
}

function dayKey(): string {
  const d = new Date();
  return `day:${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function parsePolicy(raw: unknown): PolicyConfig {
  return PolicyConfigSchema.parse(raw);
}

function inferProvider(host: string): string {
  if (host.includes("quicknode")) return "QuickNode";
  if (host.includes("helius")) return "Helius";
  if (host.includes("bigquery")) return "BigQuery";
  if (host.includes("coingecko")) return "CoinGecko";
  return host.split(".")[0] ?? "unknown";
}

function receiptAmount(value: number | null, reason: string | null): number {
  if (value !== null) return value;
  if (reason === "no_payment_required") return 0;
  throw new Error("Paid receipt is missing amountUsd");
}

function receiptCurrency(
  value: string | null,
  reason: string | null,
): "USDC" | "SOL" | "UNPAID" {
  if (value === "USDC" || value === "SOL") return value;
  if (reason === "no_payment_required") return "UNPAID";
  throw new Error("Paid receipt is missing currency");
}

function receiptNetwork(value: string | null, reason: string | null): string {
  if (value) return value;
  if (reason === "no_payment_required") return "unpaid";
  throw new Error("Paid receipt is missing network");
}

function requiredReceiptNumber(value: number | null, field: string): number {
  if (value !== null) return value;
  throw new Error(`Receipt is missing ${field}`);
}

function requiredReceiptText(value: string | null, field: string): string {
  if (value) return value;
  throw new Error(`Receipt is missing ${field}`);
}

export async function getAgents(): Promise<AgentRow[]> {
  const db = getDb();
  const currentUser = await getCurrentUser();
  const rows = await db
    .select({
      id: agents.id,
      walletId: wallets.id,
      name: agents.name,
      status: agents.status,
      publicKey: wallets.publicKey,
      network: wallets.network,
      policyConfig: policies.config,
      spentTodayUsd: spendWindows.amountUsd,
      lastReceiptAt: receipts.createdAt,
    })
    .from(agents)
    .leftJoin(wallets, and(eq(wallets.agentId, agents.id), eq(wallets.status, "active")))
    .leftJoin(
      policies,
      and(eq(policies.agentId, agents.id), isNotNull(policies.activatedAt)),
    )
    .leftJoin(
      spendWindows,
      and(eq(spendWindows.agentId, agents.id), eq(spendWindows.windowKey, dayKey())),
    )
    .leftJoin(receipts, eq(receipts.agentId, agents.id))
    .where(eq(agents.userId, currentUser.id))
    .orderBy(desc(receipts.createdAt));

  // collapse multiple receipt joins to one row per agent (max receipt timestamp wins)
  const byAgent = new Map<string, AgentRow & { walletId: string }>();
  for (const r of rows) {
    if (!r.publicKey || !r.network || !r.walletId) continue;
    const policy = parsePolicy(r.policyConfig);
    const last = byAgent.get(r.id);
    const lastActivityAt = Math.max(
      last?.lastActivityAt ?? 0,
      r.lastReceiptAt?.getTime() ?? 0,
    );
    byAgent.set(r.id, {
      id: r.id,
      name: r.name,
      status: r.status,
      publicKey: r.publicKey,
      network: r.network,
      balanceUsd: 0,
      spentTodayUsd: r.spentTodayUsd ?? 0,
      dailyCapUsd: policy.maxUsdPerDay,
      lastActivityAt,
      policy,
      walletId: r.walletId,
    });
  }
  const walletService = createWalletService({
    db,
    rpcUrl: requireEnv("SOLANA_RPC_URL"),
  });
  const withBalances = await Promise.all(
    [...byAgent.values()].map(async (agent) => {
      const balance = await walletService.getUsdcBalance(agent.walletId);
      const { walletId, ...row } = agent;
      return { ...row, balanceUsd: balance.usd };
    }),
  );
  return withBalances.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getAgent(id: string): Promise<AgentRow | undefined> {
  const all = await getAgents();
  return all.find((a) => a.id === id);
}

export async function getReceipts(opts: {
  agentId?: string;
  limit?: number;
  decision?: "allow" | "deny" | "failed";
} = {}): Promise<ReceiptRow[]> {
  const db = getDb();
  const currentUser = await getCurrentUser();
  const where = and(
    eq(agents.userId, currentUser.id),
    ...(opts.agentId ? [eq(receipts.agentId, opts.agentId)] : []),
    ...(opts.decision ? [eq(receipts.decision, opts.decision)] : []),
  );
  const rows = await db
    .select({
      id: receipts.id,
      agentId: receipts.agentId,
      agentName: agents.name,
      url: receipts.url,
      method: receipts.method,
      host: receipts.host,
      amountUsd: receipts.amountUsd,
      currency: receipts.currency,
      network: receipts.network,
      decision: receipts.decision,
      decisionReason: receipts.decisionReason,
      responseStatus: receipts.responseStatus,
      txSignature: receipts.txSignature,
      createdAt: receipts.createdAt,
    })
    .from(receipts)
    .innerJoin(agents, eq(agents.id, receipts.agentId))
    .where(where as any)
    .orderBy(desc(receipts.createdAt))
    .limit(opts.limit ?? 200);

  return rows.map((r) => ({
    id: r.id,
    agentId: r.agentId,
    agentName: r.agentName,
    provider: inferProvider(r.host),
    url: r.url,
    method: r.method,
    amountUsd: receiptAmount(r.amountUsd, r.decisionReason),
    currency: receiptCurrency(r.currency, r.decisionReason),
    network: receiptNetwork(r.network, r.decisionReason),
    decision: r.decision,
    decisionReason: requiredReceiptText(r.decisionReason, "decisionReason"),
    responseStatus: requiredReceiptNumber(r.responseStatus, "responseStatus"),
    txSignature: r.txSignature ?? undefined,
    createdAt: r.createdAt.getTime(),
  }));
}

export async function getApprovals(opts: { agentId?: string } = {}): Promise<ApprovalRow[]> {
  const db = getDb();
  const currentUser = await getCurrentUser();
  const where = opts.agentId
    ? and(
        eq(approvals.status, "pending"),
        eq(approvals.agentId, opts.agentId),
        eq(agents.userId, currentUser.id),
      )
    : and(eq(approvals.status, "pending"), eq(agents.userId, currentUser.id));
  const rows = await db
    .select({
      id: approvals.id,
      agentId: approvals.agentId,
      agentName: agents.name,
      amountUsd: approvals.amountUsd,
      triggeringRule: approvals.triggeringRule,
      requestSnapshot: approvals.requestSnapshot,
      createdAt: approvals.createdAt,
    })
    .from(approvals)
    .innerJoin(agents, eq(agents.id, approvals.agentId))
    .where(where)
    .orderBy(approvals.createdAt);

  return rows.map((r) => {
    const snap = r.requestSnapshot as { request?: { url?: string } } | null;
    if (!snap?.request?.url) {
      throw new Error(`Approval ${r.id} has no request URL`);
    }
    const url = snap.request.url;
    const host = new URL(url).host;
    return {
      id: r.id,
      agentId: r.agentId,
      agentName: r.agentName,
      provider: inferProvider(host),
      url,
      amountUsd: r.amountUsd,
      triggeringRule: r.triggeringRule,
      reason: `Amount $${r.amountUsd.toFixed(4)} crossed ${r.triggeringRule}`,
      createdAt: r.createdAt.getTime(),
    };
  });
}

export async function getSummary() {
  const [agentRows, receiptRows, approvalRows] = await Promise.all([
    getAgents(),
    getReceipts({ limit: 500 }),
    getApprovals(),
  ]);
  const totalBalance = agentRows.reduce((s, a) => s + a.balanceUsd, 0);
  const spendToday = agentRows.reduce((s, a) => s + a.spentTodayUsd, 0);
  const since = Date.now() - 86400_000;
  const blocked = receiptRows.filter(
    (r) => r.decision === "deny" && r.createdAt > since,
  );
  return {
    totalBalance,
    spendToday,
    spendWeek: spendToday * 4.7,
    blockedCount: blocked.length,
    blockedUsd: blocked.reduce((s, r) => s + r.amountUsd, 0),
    activeAgents: agentRows.filter((a) => a.status === "active").length,
    pending: approvalRows.length,
    treasuryPubkey: agentRows[0]?.publicKey,
    network: agentRows[0]?.network,
  };
}

import "server-only";
import { randomUUID } from "node:crypto";
import { PolicyConfigSchema, type PolicyConfig, type Network } from "@warden/core";
import {
  agentResponseArtifacts,
  agentChatMessages,
  agents,
  approvals,
  policies,
  receipts,
  spendWindows,
  wallets,
} from "@warden/db";
import { createWalletService } from "@warden/wallet";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { getCurrentUser } from "./auth";
import { getDb } from "./db";
import { requireEnv } from "./env";

export interface AgentRow {
  id: string;
  name: string;
  status: "active" | "revoked";
  publicKey: string;
  network: Network;
  balanceUsd: number;
  celoBalance: number;
  usdcBalance: number;
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
  currency: "USDC" | "UNPAID";
  network: string;
  decision: "allow" | "deny" | "failed";
  decisionReason: string;
  responseStatus: number;
  txSignature: string | undefined;
  artifacts?: ResponseArtifactRow[];
  createdAt: number;
}

export interface ResponseArtifactRow {
  id: string;
  title: string;
  operationId: string | undefined;
  url: string;
  method: string;
  responseStatus: number | undefined;
  responseBody: unknown;
  endpointMetadata: unknown;
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

export interface AgentChatToolCall {
  tool: string;
  arguments: Record<string, unknown>;
  result: unknown;
  isError: boolean;
}

export interface AgentChatMessageRow {
  id: string;
  role: "user" | "assistant";
  text: string;
  calls?: AgentChatToolCall[];
  artifacts?: ResponseArtifactRow[];
  createdAt: number;
}

interface NewAgentChatMessage {
  role: "user" | "assistant";
  text: string;
  calls?: AgentChatToolCall[];
}

interface ResponseArtifactInsert {
  messageId: string;
  receiptId?: string;
  toolName: string;
  url: string;
  method: string;
  responseStatus?: number;
  title: string;
  operationId?: string;
  endpointMetadata?: unknown;
  responseBody: unknown;
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
  if (
    reason === "no_payment_required" ||
    reason === "zero_payment_required" ||
    reason?.startsWith("provider_http_error:")
  ) {
    return 0;
  }
  throw new Error("Paid receipt is missing amountUsd");
}

function receiptCurrency(
  value: string | null,
  reason: string | null,
): "USDC" | "UNPAID" {
  if (value === "USDC") return value;
  if (
    reason === "no_payment_required" ||
    reason === "zero_payment_required" ||
    reason?.startsWith("provider_http_error:")
  ) {
    return "UNPAID";
  }
  throw new Error("Paid receipt is missing currency");
}

function receiptNetwork(value: string | null, reason: string | null): string {
  if (value) return value;
  if (
    reason === "no_payment_required" ||
    reason === "zero_payment_required" ||
    reason?.startsWith("provider_http_error:")
  ) {
    return "unpaid";
  }
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
      policyVersion: policies.version,
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
  const byAgent = new Map<
    string,
    AgentRow & { walletId: string; policyVersion: number }
  >();
  for (const r of rows) {
    if (!r.publicKey || !r.network || !r.walletId || r.policyVersion === null) {
      continue;
    }
    const policy = parsePolicy(r.policyConfig);
    const last = byAgent.get(r.id);
    const lastActivityAt = Math.max(
      last?.lastActivityAt ?? 0,
      r.lastReceiptAt?.getTime() ?? 0,
    );
    if (last && r.policyVersion < last.policyVersion) {
      byAgent.set(r.id, { ...last, lastActivityAt });
      continue;
    }
    byAgent.set(r.id, {
      id: r.id,
      name: r.name,
      status: r.status,
      publicKey: r.publicKey,
      network: r.network,
      balanceUsd: 0,
      celoBalance: 0,
      usdcBalance: 0,
      spentTodayUsd: r.spentTodayUsd ?? 0,
      dailyCapUsd: policy.maxUsdPerDay,
      lastActivityAt,
      policy,
      walletId: r.walletId,
      policyVersion: r.policyVersion,
    });
  }
  const walletService = createWalletService({
    db,
    rpcUrl: requireEnv("CELO_RPC_URL"),
    rpcUrls: {
      mainnet: process.env.CELO_MAINNET_RPC_URL,
      sepolia: process.env.CELO_SEPOLIA_RPC_URL,
    },
  });
  const withBalances = await Promise.all(
    [...byAgent.values()].map(async (agent) => {
      const [nativeBalance, usdcBalance] = await Promise.all([
        walletService.getBalance(agent.walletId),
        walletService.getUsdcBalance(agent.walletId),
      ]);
      const { walletId, policyVersion, ...row } = agent;
      return {
        ...row,
        balanceUsd: usdcBalance.usd,
        celoBalance: nativeBalance.celo,
        usdcBalance: usdcBalance.usd,
      };
    }),
  );
  return withBalances.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getAgent(id: string): Promise<AgentRow | undefined> {
  const all = await getAgents();
  return all.find((a) => a.id === id);
}

export async function requireCurrentUserAgent(agentId: string) {
  const db = getDb();
  const currentUser = await getCurrentUser();
  const [agent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.userId, currentUser.id)))
    .limit(1);

  if (!agent) {
    throw new Error("Agent not found");
  }

  return currentUser;
}

function parseToolCalls(value: unknown): AgentChatToolCall[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is AgentChatToolCall => {
    const call = item as Partial<AgentChatToolCall>;
    return (
      typeof call.tool === "string" &&
      typeof call.arguments === "object" &&
      call.arguments !== null &&
      typeof call.isError === "boolean"
    );
  });
}

export async function getAgentChatMessages(
  agentId: string,
): Promise<AgentChatMessageRow[] | undefined> {
  const db = getDb();
  const currentUser = await requireCurrentUserAgent(agentId).catch((error) => {
    if ((error as Error).message === "Agent not found") return undefined;
    throw error;
  });
  if (!currentUser) return undefined;

  const rows = await db
    .select({
      id: agentChatMessages.id,
      role: agentChatMessages.role,
      text: agentChatMessages.content,
      calls: agentChatMessages.toolCalls,
      createdAt: agentChatMessages.createdAt,
    })
    .from(agentChatMessages)
    .where(
      and(
        eq(agentChatMessages.agentId, agentId),
        eq(agentChatMessages.userId, currentUser.id),
      ),
    )
    .orderBy(
      agentChatMessages.createdAt,
      sql`case when ${agentChatMessages.role} = 'user' then 0 else 1 end`,
    );

  const messageRows = rows.map((row) => ({
    id: row.id,
    role: row.role,
    text: row.text,
    ...(parseToolCalls(row.calls) ? { calls: parseToolCalls(row.calls) } : {}),
    createdAt: row.createdAt.getTime(),
  }));
  const ids = messageRows.map((row) => row.id);
  if (ids.length === 0) return messageRows;

  const artifactRows = await db
    .select({
      id: agentResponseArtifacts.id,
      messageId: agentResponseArtifacts.messageId,
      title: agentResponseArtifacts.title,
      operationId: agentResponseArtifacts.operationId,
      url: agentResponseArtifacts.url,
      method: agentResponseArtifacts.method,
      responseStatus: agentResponseArtifacts.responseStatus,
      responseBody: agentResponseArtifacts.responseBody,
      endpointMetadata: agentResponseArtifacts.endpointMetadata,
      createdAt: agentResponseArtifacts.createdAt,
    })
    .from(agentResponseArtifacts)
    .where(inArray(agentResponseArtifacts.messageId, ids))
    .orderBy(desc(agentResponseArtifacts.createdAt));
  const artifactsByMessage = new Map<string, ResponseArtifactRow[]>();
  for (const artifact of artifactRows) {
    if (!artifact.messageId) continue;
    const list = artifactsByMessage.get(artifact.messageId) ?? [];
    list.push({
      id: artifact.id,
      title: artifact.title,
      operationId: artifact.operationId ?? undefined,
      url: artifact.url,
      method: artifact.method,
      responseStatus: artifact.responseStatus ?? undefined,
      responseBody: artifact.responseBody,
      endpointMetadata: artifact.endpointMetadata,
      createdAt: artifact.createdAt.getTime(),
    });
    artifactsByMessage.set(artifact.messageId, list);
  }
  return messageRows.map((row) => ({
    ...row,
    ...(artifactsByMessage.get(row.id)?.length
      ? { artifacts: artifactsByMessage.get(row.id) }
      : {}),
  }));
}

export async function appendAgentChatMessages(
  agentId: string,
  messages: NewAgentChatMessage[],
) {
  if (messages.length === 0) return;

  const db = getDb();
  const currentUser = await requireCurrentUserAgent(agentId);
  const rows = messages.map((message) => ({
    id: `acm_${randomUUID()}`,
    agentId,
    userId: currentUser.id,
    role: message.role,
    content: message.text,
    toolCalls: message.calls ?? null,
    message,
  }));

  await db.insert(agentChatMessages).values(
    rows.map(({ message: _message, ...row }) => row),
  );

  const artifacts = rows.flatMap((row) =>
    responseArtifactsForCalls(row.message.calls ?? [], row.id),
  );
  if (artifacts.length === 0) return;

  await db.insert(agentResponseArtifacts).values(
    artifacts.map((artifact) => ({
      id: `ara_${randomUUID()}`,
      agentId,
      userId: currentUser.id,
      messageId: artifact.messageId,
      ...(artifact.receiptId !== undefined ? { receiptId: artifact.receiptId } : {}),
      toolName: artifact.toolName,
      url: artifact.url,
      method: artifact.method,
      ...(artifact.responseStatus !== undefined
        ? { responseStatus: artifact.responseStatus }
        : {}),
      title: artifact.title,
      ...(artifact.operationId !== undefined
        ? { operationId: artifact.operationId }
        : {}),
      ...(artifact.endpointMetadata !== undefined
        ? { endpointMetadata: artifact.endpointMetadata }
        : {}),
      responseBody: artifact.responseBody,
    })),
  );
}

function responseArtifactsForCalls(
  calls: AgentChatToolCall[],
  messageId: string,
): ResponseArtifactInsert[] {
  return calls.flatMap((call) => {
    if (call.isError || (call.tool !== "warden_fetch" && call.tool !== "warden_pay")) {
      return [];
    }
    const body = responseBodyFromToolResult(call.result);
    if (body === undefined) return [];
    const endpoint = endpointForCall(calls, call);
    const data = isRecord(call.result) ? call.result.data : undefined;
    const response = isRecord(data) ? data.response : undefined;
    const receiptId = isRecord(data) && typeof data.receiptId === "string"
      ? data.receiptId
      : undefined;
    return [
      {
        messageId,
        ...(receiptId !== undefined ? { receiptId } : {}),
        toolName: call.tool,
        url: typeof call.arguments.url === "string" ? call.arguments.url : "",
        method: typeof call.arguments.method === "string" ? call.arguments.method : "GET",
        ...(isRecord(response) && typeof response.status === "number"
          ? { responseStatus: response.status }
          : {}),
        title:
          (endpoint && typeof endpoint.summary === "string"
            ? endpoint.summary
            : undefined) ?? "x402 response",
        ...(endpoint && typeof endpoint.operationId === "string"
          ? { operationId: endpoint.operationId }
          : {}),
        ...(endpoint ? { endpointMetadata: endpoint } : {}),
        responseBody: body,
      },
    ];
  });
}

function responseBodyFromToolResult(result: unknown) {
  if (!isRecord(result)) return undefined;
  const data = result.data;
  if (!isRecord(data)) return undefined;
  const response = data.response;
  if (!isRecord(response)) return undefined;
  return response.body;
}

function endpointForCall(calls: AgentChatToolCall[], fetchCall: AgentChatToolCall) {
  const url = typeof fetchCall.arguments.url === "string" ? fetchCall.arguments.url : "";
  if (!url) return undefined;
  for (const call of calls) {
    if (call.tool !== "get_skill_endpoints" || !isRecord(call.result)) continue;
    const data = call.result.data;
    if (!isRecord(data) || !Array.isArray(data.endpoints)) continue;
    const endpoint = data.endpoints.find((candidate) => {
      if (!isRecord(candidate)) return false;
      const endpointUrl = typeof candidate.url === "string" ? candidate.url : "";
      return endpointUrl === url || templateMatches(endpointUrl, url);
    });
    if (isRecord(endpoint)) return endpoint;
  }
  return undefined;
}

function templateMatches(template: string, url: string) {
  if (!template.includes("{")) return false;
  const escaped = template
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\\\{[^}]+\\\}/g, "[^/]+");
  return new RegExp(`^${escaped}$`).test(url);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

  const receiptRows = rows.map((r) => ({
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
  const ids = receiptRows.map((row) => row.id);
  if (ids.length === 0) return receiptRows;

  const artifactRows = await db
    .select({
      id: agentResponseArtifacts.id,
      receiptId: agentResponseArtifacts.receiptId,
      title: agentResponseArtifacts.title,
      operationId: agentResponseArtifacts.operationId,
      url: agentResponseArtifacts.url,
      method: agentResponseArtifacts.method,
      responseStatus: agentResponseArtifacts.responseStatus,
      responseBody: agentResponseArtifacts.responseBody,
      endpointMetadata: agentResponseArtifacts.endpointMetadata,
      createdAt: agentResponseArtifacts.createdAt,
    })
    .from(agentResponseArtifacts)
    .where(inArray(agentResponseArtifacts.receiptId, ids))
    .orderBy(desc(agentResponseArtifacts.createdAt));
  const artifactsByReceipt = new Map<string, ResponseArtifactRow[]>();
  for (const artifact of artifactRows) {
    if (!artifact.receiptId) continue;
    const list = artifactsByReceipt.get(artifact.receiptId) ?? [];
    list.push({
      id: artifact.id,
      title: artifact.title,
      operationId: artifact.operationId ?? undefined,
      url: artifact.url,
      method: artifact.method,
      responseStatus: artifact.responseStatus ?? undefined,
      responseBody: artifact.responseBody,
      endpointMetadata: artifact.endpointMetadata,
      createdAt: artifact.createdAt.getTime(),
    });
    artifactsByReceipt.set(artifact.receiptId, list);
  }
  return receiptRows.map((row) => ({
    ...row,
    ...(artifactsByReceipt.get(row.id)?.length
      ? { artifacts: artifactsByReceipt.get(row.id) }
      : {}),
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

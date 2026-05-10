import { loadServerEnv, newId } from "@warden/core";
import {
  agentChatMessages,
  desc,
  eq,
  receipts,
  schema,
  wallets,
} from "@warden/db";
import { hashRequest } from "@warden/x402";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

loadServerEnv();

interface ToolCall {
  tool: string;
  arguments: Record<string, unknown>;
  result: unknown;
  isError: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCalls(value: unknown): ToolCall[] {
  if (!Array.isArray(value)) return [];
  return value.filter((call): call is ToolCall => {
    return (
      isRecord(call) &&
      typeof call.tool === "string" &&
      isRecord(call.arguments) &&
      typeof call.isError === "boolean"
    );
  });
}

function dataFromResult(result: unknown) {
  if (!isRecord(result)) return undefined;
  const data = result.data;
  return isRecord(data) ? data : undefined;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function blockedAnalyzeCall(calls: ToolCall[]) {
  return calls.find((call) => {
    if (call.tool !== "warden_analyze" || call.isError) return false;
    return dataFromResult(call.result)?.decision === "blocked";
  });
}

function requestFromAnalyze(call: ToolCall) {
  const request = isRecord(call.arguments.request)
    ? call.arguments.request
    : undefined;
  const url = stringValue(request?.url);
  if (!url) return undefined;
  const method = stringValue(request?.method) ?? "GET";
  return {
    url,
    method,
    ...(request?.body !== undefined ? { body: request.body } : {}),
    ...(isRecord(request?.headers)
      ? { headers: request.headers as Record<string, string> }
      : {}),
  };
}

function receiptReason(data: Record<string, unknown>) {
  const threat = isRecord(data.threat) ? data.threat : undefined;
  const policyPreview = isRecord(data.policyPreview) ? data.policyPreview : undefined;
  const policyDecision = isRecord(policyPreview?.decision)
    ? policyPreview.decision
    : undefined;
  const rationale = stringValue(data.rationale) ?? "warden_analyze blocked request";
  const threatRule = stringValue(threat?.rule);
  const threatReason = stringValue(threat?.reason);
  if (threatRule && threatReason) return `${threatRule}: ${threatReason}`;
  const policyRule = stringValue(policyDecision?.rule);
  const policyReason = stringValue(policyDecision?.reason);
  if (policyRule && policyReason) return `${policyRule}: ${policyReason}`;
  return `warden_analyze: ${rationale}`;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const client = postgres(databaseUrl, {
    max: 1,
    idle_timeout: 1,
    prepare: false,
    connection: { application_name: "warden-blocked-analyze-backfill" },
  });
  const db = drizzle(client, { schema });
  try {
  const messages = await db
    .select({
      id: agentChatMessages.id,
      agentId: agentChatMessages.agentId,
      toolCalls: agentChatMessages.toolCalls,
      createdAt: agentChatMessages.createdAt,
    })
    .from(agentChatMessages)
    .where(eq(agentChatMessages.role, "assistant"))
    .orderBy(desc(agentChatMessages.createdAt));

  const walletRows = await db
    .select({
      agentId: wallets.agentId,
      walletId: wallets.id,
    })
    .from(wallets);
  const walletByAgentId = new Map(walletRows.map((wallet) => [wallet.agentId, wallet.walletId]));

  const existing = await db
    .select({
      requestHash: receipts.requestHash,
      challengeHash: receipts.challengeHash,
    })
    .from(receipts)
    .where(eq(receipts.decision, "deny"));
  const existingKeys = new Set(
    existing
      .filter((row) => row.requestHash && row.challengeHash)
      .map((row) => `${row.requestHash}:${row.challengeHash}`),
  );

  const inserts = [];
  let blockedAnalyzeCalls = 0;
  let skippedExisting = 0;
  let skippedIncomplete = 0;

  for (const message of messages) {
    const call = blockedAnalyzeCall(parseCalls(message.toolCalls));
    if (!call) continue;
    blockedAnalyzeCalls += 1;

    const data = dataFromResult(call.result);
    const request = requestFromAnalyze(call);
    const x402 = isRecord(data?.x402) ? data.x402 : undefined;
    const policyPreview = isRecord(data?.policyPreview) ? data.policyPreview : undefined;
    const context = isRecord(data?.context) ? data.context : undefined;
    const selectedSkill = isRecord(context?.selectedSkill) ? context.selectedSkill : undefined;
    const walletId = walletByAgentId.get(message.agentId);
    const challengeHash = stringValue(x402?.challengeHash);
    if (!data || !request || !x402 || !walletId || !challengeHash) {
      skippedIncomplete += 1;
      continue;
    }

    const reqHash = hashRequest(request);
    const key = `${reqHash}:${challengeHash}`;
    if (existingKeys.has(key)) {
      skippedExisting += 1;
      continue;
    }

    inserts.push({
      id: newId.receipt(),
      agentId: message.agentId,
      walletId,
      ...(stringValue(policyPreview?.policyId) ? { policyId: stringValue(policyPreview?.policyId) } : {}),
      ...(stringValue(selectedSkill?.title) || stringValue(selectedSkill?.fqn)
        ? { provider: stringValue(selectedSkill?.title) ?? stringValue(selectedSkill?.fqn) }
        : {}),
      url: request.url,
      method: request.method.toUpperCase(),
      host: new URL(request.url).host,
      amountRaw: stringValue(x402.amountRaw),
      amountUsd: numberValue(x402.amountUsd),
      currency: stringValue(x402.token),
      network: stringValue(x402.network),
      recipient: stringValue(x402.recipient),
      challengeHash,
      requestHash: reqHash,
      responseStatus: numberValue(x402.responseStatus) ?? 402,
      decision: "deny" as const,
      decisionReason: receiptReason(data),
      ...(stringValue(context?.task) ? { taskId: stringValue(context?.task) } : {}),
      createdAt: message.createdAt,
    });
    existingKeys.add(key);
  }

  if (inserts.length > 0) {
    await db.insert(receipts).values(inserts);
  }

  console.log(
    JSON.stringify(
      {
        scannedMessages: messages.length,
        blockedAnalyzeCalls,
        insertedReceipts: inserts.length,
        skippedExisting,
        skippedIncomplete,
      },
      null,
      2,
    ),
  );
  } finally {
    await client.end({ timeout: 5 });
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

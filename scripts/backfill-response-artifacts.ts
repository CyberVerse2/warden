import { randomUUID } from "node:crypto";
import { loadServerEnv } from "@warden/core";
import {
  agentChatMessages,
  agentResponseArtifacts,
  createDb,
  desc,
  eq,
} from "@warden/db";
import { inArray } from "drizzle-orm";

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

function responseBody(result: unknown) {
  if (!isRecord(result)) return undefined;
  const data = result.data;
  if (!isRecord(data)) return undefined;
  const response = data.response;
  if (!isRecord(response)) return undefined;
  return response.body;
}

function responseStatus(result: unknown) {
  if (!isRecord(result)) return undefined;
  const data = result.data;
  if (!isRecord(data)) return undefined;
  const response = data.response;
  if (!isRecord(response)) return undefined;
  return typeof response.status === "number" ? response.status : undefined;
}

function receiptId(result: unknown) {
  if (!isRecord(result)) return undefined;
  const data = result.data;
  if (!isRecord(data)) return undefined;
  return typeof data.receiptId === "string" ? data.receiptId : undefined;
}

function endpointForCall(calls: ToolCall[], fetchCall: ToolCall) {
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

function finalResponseCall(calls: ToolCall[]) {
  return [...calls]
    .reverse()
    .find((call) => {
      if (call.isError || (call.tool !== "warden_fetch" && call.tool !== "warden_pay")) {
        return false;
      }
      return responseBody(call.result) !== undefined;
    });
}

async function main() {
  const db = createDb();
  const messages = await db
    .select({
      id: agentChatMessages.id,
      agentId: agentChatMessages.agentId,
      userId: agentChatMessages.userId,
      toolCalls: agentChatMessages.toolCalls,
    })
    .from(agentChatMessages)
    .where(eq(agentChatMessages.role, "assistant"))
    .orderBy(desc(agentChatMessages.createdAt));

  const messageIds = messages.map((message) => message.id);
  const existingForMessages =
    messageIds.length === 0
      ? []
      : await db
          .select({
            messageId: agentResponseArtifacts.messageId,
            receiptId: agentResponseArtifacts.receiptId,
          })
          .from(agentResponseArtifacts)
          .where(inArray(agentResponseArtifacts.messageId, messageIds));
  const existingMessageIds = new Set(
    existingForMessages
      .map((row) => row.messageId)
      .filter((id): id is string => typeof id === "string"),
  );
  const existingReceiptIds = new Set(
    existingForMessages
      .map((row) => row.receiptId)
      .filter((id): id is string => typeof id === "string"),
  );

  const inserts = [];
  for (const message of messages) {
    if (existingMessageIds.has(message.id)) continue;
    const calls = parseCalls(message.toolCalls);
    const call = finalResponseCall(calls);
    if (!call) continue;

    const body = responseBody(call.result);
    if (body === undefined) continue;
    const rid = receiptId(call.result);
    if (rid && existingReceiptIds.has(rid)) continue;

    const endpoint = endpointForCall(calls, call);
    inserts.push({
      id: `ara_${randomUUID()}`,
      agentId: message.agentId,
      userId: message.userId,
      messageId: message.id,
      ...(rid ? { receiptId: rid } : {}),
      toolName: call.tool,
      url: typeof call.arguments.url === "string" ? call.arguments.url : "",
      method: typeof call.arguments.method === "string" ? call.arguments.method : "GET",
      ...(responseStatus(call.result) !== undefined
        ? { responseStatus: responseStatus(call.result) }
        : {}),
      title:
        endpoint && typeof endpoint.summary === "string"
          ? endpoint.summary
          : "x402 response",
      ...(endpoint && typeof endpoint.operationId === "string"
        ? { operationId: endpoint.operationId }
        : {}),
      ...(endpoint ? { endpointMetadata: endpoint } : {}),
      responseBody: body,
    });
    if (rid) existingReceiptIds.add(rid);
    existingMessageIds.add(message.id);
  }

  if (inserts.length > 0) {
    await db.insert(agentResponseArtifacts).values(inserts);
  }

  console.log(
    JSON.stringify(
      {
        scannedMessages: messages.length,
        insertedArtifacts: inserts.length,
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

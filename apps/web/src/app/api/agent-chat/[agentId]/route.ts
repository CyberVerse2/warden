import { getOrigin } from "~/lib/origin";
import { loadServerEnv } from "~/lib/env";
import {
  appendAgentChatMessages,
  requireCurrentUserAgent,
} from "~/lib/queries";
import { compactX402EndpointResult } from "~/lib/compact-x402-endpoints";
import {
  AI_SDK_AGENT_SYSTEM_PROMPT,
} from "~/lib/agent-chat-planner";
import { createMCPClient, type MCPTransport } from "@ai-sdk/mcp";
import { createOpenAI } from "@ai-sdk/openai";
import { stepCountIs, streamText, type Tool, type ToolSet } from "ai";

export const dynamic = "force-dynamic";

interface ChatRequest {
  message?: string;
  token?: string;
}

interface McpContent {
  type: string;
  text?: string;
}

interface McpTool {
  name: string;
  description: string;
  inputSchema?: unknown;
}

interface McpToolCall {
  tool: string;
  arguments: Record<string, unknown>;
  result: unknown;
  isError: boolean;
}

type WardenToolSet = ToolSet;

function sse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function logStage(
  stage: string,
  details: Record<string, unknown> = {},
) {
  console.info(
    "[agent-chat:stage]",
    JSON.stringify({
      stage,
      ...details,
    }),
  );
}

function callSummary(call: McpToolCall | undefined) {
  if (!call) return null;
  return {
    tool: call.tool,
    isError: call.isError,
    arguments: call.arguments,
  };
}

function errorSummary(error: unknown) {
  const record = error as
    | {
        name?: string;
        message?: string;
        cause?: unknown;
        text?: string;
        response?: unknown;
        usage?: unknown;
      }
    | undefined;
  return {
    name: record?.name,
    message: record?.message ?? String(error),
    cause:
      record?.cause instanceof Error
        ? { name: record.cause.name, message: record.cause.message }
        : record?.cause,
    textPreview:
      typeof record?.text === "string" ? record.text.slice(0, 2_000) : undefined,
    response: record?.response,
    usage: record?.usage,
  };
}

function plannerCallContext(calls: McpToolCall[]) {
  return calls.map((call) => ({
    tool: call.tool,
    isError: call.isError,
    arguments: call.arguments,
    resultKind:
      typeof call.result === "object" && call.result !== null
        ? Object.keys(call.result as Record<string, unknown>).slice(0, 12)
        : typeof call.result,
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function responseBody(call: McpToolCall) {
  const result = call.result as
    | {
        ok?: boolean;
        data?: {
          response?: {
            body?: unknown;
          };
        };
      }
    | undefined;
  return result?.data?.response?.body;
}

function findQueuedBody(value: unknown): Record<string, unknown> | undefined {
  if (isRecord(value)) {
    const status = stringField(value, "status")?.toUpperCase();
    const requestId = stringField(value, "request_id") ?? stringField(value, "requestId");
    const hasPollUrl =
      stringField(value, "response_url") ??
      stringField(value, "responseUrl") ??
      stringField(value, "status_url") ??
      stringField(value, "statusUrl") ??
      stringField(value, "poll_url") ??
      stringField(value, "pollUrl");
    if (
      status === "IN_QUEUE" ||
      status === "IN_PROGRESS" ||
      status === "PROCESSING" ||
      status === "RUNNING" ||
      requestId ||
      hasPollUrl
    ) {
      return value;
    }
    for (const child of Object.values(value)) {
      const found = findQueuedBody(child);
      if (found) return found;
    }
  }
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findQueuedBody(child);
      if (found) return found;
    }
  }
  return undefined;
}

function stringField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

type WardenFetchCall = {
  tool: "warden_fetch";
  arguments: {
    url: string;
    method: "GET";
    body: null;
  };
};

function queuedFetchCall(call: McpToolCall, calls: McpToolCall[]): WardenFetchCall | undefined {
  if (call.tool !== "warden_fetch" && call.tool !== "warden_pay") return undefined;
  const body = findQueuedBody(responseBody(call) ?? call.result);
  if (!body) return undefined;
  const requestId = stringField(body, "request_id") ?? stringField(body, "requestId");

  const status = stringField(body, "status")?.toUpperCase();
  const queued =
    status === "IN_QUEUE" ||
    status === "IN_PROGRESS" ||
    status === "PROCESSING" ||
    status === "RUNNING" ||
    Boolean(requestId);
  if (!queued) return undefined;

  const pollUrl =
    (requestId ? paidPollUrlForQueue(call, calls, requestId) : undefined) ??
    gatewayQueueUrlForProviderQueueUrl(call, body) ??
    stringField(body, "response_url") ??
    stringField(body, "responseUrl") ??
    stringField(body, "status_url") ??
    stringField(body, "statusUrl") ??
    stringField(body, "poll_url") ??
    stringField(body, "pollUrl");
  if (!pollUrl) return undefined;

  return {
    tool: "warden_fetch",
    arguments: {
      url: pollUrl,
      method: "GET",
      body: null,
    },
  };
}

function gatewayQueueUrlForProviderQueueUrl(
  call: McpToolCall,
  body: Record<string, unknown>,
) {
  const submitUrl = typeof call.arguments.url === "string" ? call.arguments.url : "";
  if (!submitUrl.startsWith("https://fal.x402.paysponge.com/")) return undefined;

  const providerUrl =
    stringField(body, "response_url") ??
    stringField(body, "responseUrl") ??
    stringField(body, "status_url") ??
    stringField(body, "statusUrl") ??
    stringField(body, "poll_url") ??
    stringField(body, "pollUrl");
  if (!providerUrl?.startsWith("https://queue.fal.run/")) return undefined;

  try {
    const url = new URL(providerUrl);
    return `https://fal.x402.paysponge.com${url.pathname}`;
  } catch {
    return undefined;
  }
}

function paidPollUrlForQueue(
  call: McpToolCall,
  calls: McpToolCall[],
  requestId: string,
) {
  const submitUrl = typeof call.arguments.url === "string" ? call.arguments.url : "";
  const submitEndpoint = endpointForUrl(calls, submitUrl);
  if (!submitEndpoint) return undefined;
  const submitPath = typeof submitEndpoint.path === "string" ? submitEndpoint.path : "";
  const basePath = submitPath.replace(/\/?$/, "");
  const familyPath = basePath.split("/").slice(0, 2).join("/");
  const acceptablePrefixes = [basePath, familyPath].filter(Boolean);
  const pollEndpoint = endpointsFromCalls(calls).find((endpoint) => {
    if (endpoint.method !== "GET") return false;
    const path = typeof endpoint.path === "string" ? endpoint.path : "";
    return (
      path.includes("{request_id}") &&
      acceptablePrefixes.some((prefix) => path.includes(`${prefix}/requests/`)) &&
      !path.endsWith("/status") &&
      !path.endsWith("/cancel")
    );
  });
  const pollUrl = typeof pollEndpoint?.url === "string" ? pollEndpoint.url : undefined;
  return pollUrl?.replace("{request_id}", encodeURIComponent(requestId));
}

function endpointsFromCalls(calls: McpToolCall[]) {
  return calls.flatMap((call) => {
    if (call.tool !== "get_skill_endpoints") return [];
    const result = call.result as
      | {
          ok?: boolean;
          data?: {
            endpoints?: Array<Record<string, unknown>>;
          };
        }
      | undefined;
    return result?.data?.endpoints ?? [];
  });
}

function endpointForUrl(calls: McpToolCall[], url: string) {
  return endpointsFromCalls(calls).find((endpoint) => {
    const endpointUrl = typeof endpoint.url === "string" ? endpoint.url : "";
    return endpointUrl === url;
  });
}

function isCatalogEndpointUrl(calls: McpToolCall[], url: string) {
  return endpointsFromCalls(calls).some((endpoint) => {
    const endpointUrl = typeof endpoint.url === "string" ? endpoint.url : "";
    return catalogEndpointUrlMatches(endpointUrl, url);
  });
}

function catalogEndpointUrlMatches(template: string, candidate: string) {
  try {
    const templateUrl = new URL(template);
    const candidateUrl = new URL(candidate);
    if (templateUrl.origin !== candidateUrl.origin) return false;
    if (templateUrl.search && templateUrl.search !== candidateUrl.search) return false;
    const pattern = `^${templateUrl.pathname
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\\\{[^/]+\\\}/g, "[^/]+")}/?$`;
    return new RegExp(pattern).test(candidateUrl.pathname);
  } catch {
    return template === candidate;
  }
}

function chatModel() {
  loadServerEnv();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for agent chat");
  }
  const openai = createOpenAI({ apiKey });
  return openai.responses(process.env.WARDEN_AGENT_CHAT_MODEL || "gpt-5.4-mini");
}

function toolsForPrompt(tools: McpTool[]) {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
}

function parseToolText(result: unknown) {
  const envelope = result as
    | { content?: McpContent[]; isError?: boolean }
    | undefined;
  const text = envelope?.content?.find((item) => item.type === "text")?.text;
  if (!text) return { value: result, isError: Boolean(envelope?.isError) };
  try {
    return { value: JSON.parse(text), isError: Boolean(envelope?.isError) };
  } catch {
    return { value: text, isError: Boolean(envelope?.isError) };
  }
}

type ExecutableMcpTool = {
  execute?: (
    args: Record<string, unknown>,
    options: { abortSignal?: AbortSignal },
  ) => Promise<unknown>;
};

async function createWardenMcpClient({
  mcpUrl,
  token,
}: {
  mcpUrl: string;
  token: string;
}) {
  const transport: MCPTransport = {
    async start() {},
    async close() {},
    async send(message) {
      const res = await fetch(mcpUrl, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(message),
      });
      const raw = await res.text();
      let body: unknown;
      try {
        body = raw ? JSON.parse(raw) : undefined;
      } catch {
        body = raw;
      }
      if (!res.ok) {
        throw new Error(
          typeof body === "string" && body.trim()
            ? body
            : `MCP HTTP ${res.status}`,
        );
      }
      if (body && typeof body === "object") {
        transport.onmessage?.(body as Parameters<NonNullable<MCPTransport["onmessage"]>>[0]);
      }
    },
  };

  return createMCPClient({
    transport,
  });
}

async function callMcpTool({
  mcpTools,
  toolName,
  args,
  abortSignal,
}: {
  mcpTools: Record<string, unknown>;
  toolName: string;
  args: Record<string, unknown>;
  abortSignal?: AbortSignal;
}) {
  const tool = mcpTools[toolName] as ExecutableMcpTool | undefined;
  if (!tool?.execute) {
    throw new Error(`MCP server did not expose executable tool: ${toolName}`);
  }
  return tool.execute(args, { abortSignal });
}

function compactToolArguments(value: unknown) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null));
}

function sameCallShape(a: McpToolCall, b: McpToolCall) {
  return (
    a.tool === b.tool &&
    a.isError === b.isError &&
    JSON.stringify(a.arguments) === JSON.stringify(b.arguments)
  );
}

function discoveredSkillFqns(calls: McpToolCall[]) {
  return calls.flatMap((call) => {
    if (call.tool !== "search_skills" && call.tool !== "warden_discover") return [];
    const result = call.result as
      | {
          data?: {
            skills?: Array<Record<string, unknown>>;
            services?: Array<Record<string, unknown>>;
          };
        }
      | undefined;
    return (result?.data?.skills ?? result?.data?.services ?? [])
      .map((item) => item.fqn)
      .filter((fqn): fqn is string => typeof fqn === "string");
  });
}

function assertGroundedToolCall({
  toolName,
  args,
  calls,
}: {
  toolName: string;
  args: Record<string, unknown>;
  calls: McpToolCall[];
}) {
  if (toolName === "get_skill_endpoints") {
    const fqn = typeof args.fqn === "string" ? args.fqn : "";
    if (!new Set(discoveredSkillFqns(calls)).has(fqn)) {
      throw new Error(`get_skill_endpoints fqn was not returned by skill search: ${fqn}`);
    }
  }

  if (toolName !== "warden_fetch" && toolName !== "warden_pay") return;
  const url = typeof args.url === "string" ? args.url : "";
  if (url.includes("{")) {
    throw new Error(`Executable URL still contains an unresolved placeholder: ${url}`);
  }
  if (endpointsFromCalls(calls).length > 0 && !isCatalogEndpointUrl(calls, url)) {
    throw new Error(`Model selected a URL that is not in the inspected endpoint catalog: ${url}`);
  }
}

function wrapMcpTools({
  mcpTools,
  calls,
  emit,
}: {
  mcpTools: Record<string, unknown>;
  calls: McpToolCall[];
  emit: (data: unknown) => void;
}): WardenToolSet {
  const wrapped = Object.fromEntries(
    Object.entries(mcpTools).map(([toolName, candidate]) => {
      const mcpTool = candidate as Tool & ExecutableMcpTool;
      return [
        toolName,
        {
          ...mcpTool,
          async execute(input: unknown, options: { abortSignal?: AbortSignal } = {}) {
            const args = compactToolArguments(input);
            assertGroundedToolCall({ toolName, args, calls });
            logStage("tool.call_start", {
              tool: toolName,
              arguments: args,
            });
            const result = await mcpTool.execute?.(args, options);
            const parsed = parseToolText(result);
            const storedResult =
              toolName === "get_skill_endpoints"
                ? compactX402EndpointResult(parsed.value)
                : parsed.value;
            if (toolName === "get_skill_endpoints") {
              const data = isRecord(storedResult) && isRecord(storedResult.data)
                ? storedResult.data
                : undefined;
              logStage("tool.get_skill_endpoints.compact_result", {
                skill: data?.skill,
                endpointCount: Array.isArray(data?.endpoints)
                  ? data.endpoints.length
                  : 0,
                endpoints: data?.endpoints,
              });
            }
            const call = {
              tool: toolName,
              arguments: args,
              result: storedResult,
              isError: parsed.isError,
            };
            calls.push(call);
            emit({ type: "call", call });
            logStage("tool.call_result", {
              call: callSummary(call),
            });
            if (call.isError) {
              logStage("tool.call_error_detail", {
                tool: toolName,
                arguments: args,
                result: storedResult,
              });
            }
            return storedResult;
          },
        },
      ];
    }),
  ) as WardenToolSet;

  return wrapped;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ agentId: string }> },
) {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      async start(controller) {
        const emit = (data: unknown) => controller.enqueue(encoder.encode(sse(data)));
        let historyContext:
          | {
              agentId: string;
              prompt: string;
            }
          | undefined;

        try {
          const { agentId } = await ctx.params;
          const { message, token } = (await req.json().catch(() => ({}))) as ChatRequest;
          const prompt = message?.trim();
          const bearerToken = token?.trim();

          if (!prompt) {
            emit({ type: "error", error: "Message is required" });
            return;
          }
          if (!bearerToken) {
            emit({ type: "error", error: "MCP token is required" });
            return;
          }

          await requireCurrentUserAgent(agentId);
          historyContext = { agentId, prompt };
          logStage("request.received", {
            agentId,
            prompt,
          });

          const origin = await getOrigin();
          const mcpUrl = `${origin}/api/mcp/${agentId}`;
          emit({ type: "status", message: "Loading MCP tools" });
          logStage("mcp.loading_tools", { agentId, mcpUrl });
          const mcpClient = await createWardenMcpClient({
            mcpUrl,
            token: bearerToken,
          });
          try {
            const toolsResult = await mcpClient.listTools();
            const tools = ((toolsResult as { tools?: McpTool[] })?.tools ?? []).map(
              (tool) => ({
                name: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema,
              }),
            );
            const mcpTools = mcpClient.toolsFromDefinitions(toolsResult);
            emit({ type: "tools", tools });
            logStage("mcp.tools_loaded", {
              agentId,
              toolNames: tools.map((tool) => tool.name),
            });

            const calls: McpToolCall[] = [];
            const guardedTools = wrapMcpTools({
              mcpTools,
              calls,
              emit,
            });

            emit({ type: "status", message: "Running AI SDK tool loop" });
            logStage("ai_sdk.tool_loop.start", {
              agentId,
              toolNames: tools.map((tool) => tool.name),
            });
            const result = streamText({
              model: chatModel(),
              system: AI_SDK_AGENT_SYSTEM_PROMPT,
              prompt,
              tools: guardedTools,
              stopWhen: stepCountIs(8),
              providerOptions: {
                openai: {
                  store: false,
                  textVerbosity: "low",
                },
              },
            });

            let assistantMessage = "";
            for await (const part of result.fullStream) {
              if (part.type === "text-delta") {
                assistantMessage += part.text;
                emit({ type: "text_delta", delta: part.text });
              }
              if (part.type === "tool-input-start") {
                emit({ type: "status", message: `Preparing ${part.toolName}` });
              }
              if (part.type === "tool-call") {
                const args = isRecord(part.input) ? part.input : {};
                emit({ type: "call_start", tool: part.toolName, arguments: args });
              }
              if (part.type === "tool-error") {
                const call = {
                  tool: part.toolName,
                  arguments: isRecord(part.input) ? part.input : {},
                  result: errorSummary(part.error),
                  isError: true,
                };
                if (!calls.some((existing) => sameCallShape(existing, call))) {
                  calls.push(call);
                  emit({ type: "call", call });
                }
              }
              if (part.type === "error") {
                throw part.error instanceof Error ? part.error : new Error(String(part.error));
              }
            }

            assistantMessage = assistantMessage.trim();
            logStage("ai_sdk.tool_loop.done", {
              agentId,
              callCount: calls.length,
              answer: assistantMessage,
            });

            if (!assistantMessage) {
              throw new Error("AI final response was empty");
            }

            await appendAgentChatMessages(agentId, [
              { role: "user", text: prompt },
              { role: "assistant", text: assistantMessage, calls },
            ]);

            emit({ type: "message", message: assistantMessage, calls });
            emit({ type: "done" });
          } finally {
            await mcpClient.close().catch(() => undefined);
          }
        } catch (e) {
          const message = (e as Error).message || "Agent chat failed";
          if (historyContext) {
            await appendAgentChatMessages(historyContext.agentId, [
              { role: "user", text: historyContext.prompt },
              {
                role: "assistant",
                text: `I could not complete the MCP call: ${message}`,
              },
            ]).catch(() => undefined);
          }
          emit({ type: "error", error: message });
        } finally {
          controller.close();
        }
      },
    }),
    {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      },
    },
  );
}

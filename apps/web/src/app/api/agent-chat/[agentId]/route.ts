import { getOrigin } from "~/lib/origin";

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

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function firstUrl(text: string): string | undefined {
  return text.match(/https?:\/\/[^\s<>"')]+/i)?.[0];
}

function discoverQuery(text: string): string | undefined {
  const cleaned = text
    .replace(/\b(discover|search|find|catalog|services|providers|x402|pay)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || undefined;
}

function parseLimit(text: string, fallback: number) {
  const match = text.match(/\b(?:last|limit|show)\s+(\d{1,3})\b/i);
  if (!match) return fallback;
  return Math.max(1, Math.min(100, Number(match[1])));
}

function parseDecision(text: string) {
  if (/\bden(y|ied|ials?)\b/i.test(text)) return "deny";
  if (/\bfailed|failures?\b/i.test(text)) return "failed";
  if (/\ballowed?|paid|signed\b/i.test(text)) return "allow";
  return undefined;
}

function pickTool(message: string) {
  const text = message.toLowerCase();
  const url = firstUrl(message);

  if (/\b(receipts?|history|activity|payments?|spend)\b/i.test(message)) {
    return {
      name: "warden_receipts",
      arguments: {
        limit: parseLimit(message, 10),
        ...(parseDecision(message) ? { decision: parseDecision(message) } : {}),
      },
    };
  }

  if (/\b(discover|search|find|catalog|services?|providers?)\b/i.test(message)) {
    return {
      name: "warden_discover",
      arguments: {
        limit: parseLimit(message, 8),
        ...(discoverQuery(message) ? { query: discoverQuery(message) } : {}),
      },
    };
  }

  if (url && /\b(policy|dry|check|would|allow|deny|approve)\b/i.test(message)) {
    return {
      name: "warden_policy_check",
      arguments: { url, method: text.includes("post") ? "POST" : "GET" },
    };
  }

  if (url) {
    return {
      name: /\b(pay|purchase|402)\b/i.test(message) ? "warden_pay" : "warden_fetch",
      arguments: { url, method: text.includes("post") ? "POST" : "GET" },
    };
  }

  return { name: "warden_wallet_status", arguments: {} };
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

function summarize(toolName: string, parsed: unknown, isError: boolean) {
  const result = parsed as {
    ok?: boolean;
    data?: any;
    error?: { message?: string; code?: string };
  };
  if (isError || result?.ok === false) {
    return `MCP call ${toolName} was blocked or failed: ${
      result?.error?.message ?? "unknown error"
    }`;
  }

  if (toolName === "warden_wallet_status") {
    const data = result.data;
    return `Wallet ${data.publicKey} is ${data.status}. It has ${data.balance.sol.toFixed(
      4,
    )} SOL, $${Number(data.balance.usdcUsd).toFixed(2)} USDC, and $${Number(
      data.budget.remainingTodayUsd,
    ).toFixed(2)} remaining today.`;
  }

  if (toolName === "warden_receipts") {
    const rows = Array.isArray(result.data) ? result.data : [];
    return rows.length === 0
      ? "No matching receipts came back from the MCP."
      : `The MCP returned ${rows.length} receipt${
          rows.length === 1 ? "" : "s"
        }. Latest decision: ${rows[0]?.decision ?? "unknown"} for ${
          rows[0]?.url ?? "unknown URL"
        }.`;
  }

  if (toolName === "warden_discover") {
    const services = result.data?.services ?? [];
    return services.length === 0
      ? "The MCP searched the pay.sh catalog and found no matching x402 services."
      : `The MCP found ${services.length} service${
          services.length === 1 ? "" : "s"
        }. Top match: ${services[0]?.title ?? services[0]?.fqn ?? "unknown"}.`;
  }

  if (toolName === "warden_policy_check") {
    const data = result.data;
    return `Policy dry-run completed. Decision: ${
      data?.decision ?? data?.receipt?.decision ?? "unknown"
    }.`;
  }

  if (toolName === "warden_fetch" || toolName === "warden_pay") {
    const data = result.data;
    return `Fetch completed through Warden. Response status: ${
      data?.response?.status ?? data?.status ?? "unknown"
    }.`;
  }

  return `MCP call ${toolName} completed.`;
}

async function callMcp({
  mcpUrl,
  token,
  method,
  params,
  id,
}: {
  mcpUrl: string;
  token: string;
  method: string;
  params?: unknown;
  id: number;
}) {
  const res = await fetch(mcpUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  const body = await res.json().catch(() => undefined);
  if (!res.ok) {
    throw new Error(typeof body === "string" ? body : `MCP HTTP ${res.status}`);
  }
  if (body?.error) {
    throw new Error(body.error.message ?? "MCP JSON-RPC error");
  }
  return body?.result;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await ctx.params;
  const { message, token } = (await req.json().catch(() => ({}))) as ChatRequest;

  if (!message?.trim()) return json({ error: "Message is required" }, 400);
  if (!token?.trim()) return json({ error: "MCP token is required" }, 400);

  const origin = await getOrigin();
  const mcpUrl = `${origin}/api/mcp/${agentId}`;
  const toolsResult = await callMcp({
    mcpUrl,
    token,
    method: "tools/list",
    id: 1,
  });
  const tools = ((toolsResult as { tools?: McpTool[] })?.tools ?? []).map(
    (tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }),
  );

  const selected = pickTool(message);
  if (!tools.some((tool) => tool.name === selected.name)) {
    return json(
      {
        error: `MCP server did not expose ${selected.name}`,
        tools,
      },
      502,
    );
  }

  const result = await callMcp({
    mcpUrl,
    token,
    method: "tools/call",
    params: { name: selected.name, arguments: selected.arguments },
    id: 2,
  });
  const parsed = parseToolText(result);
  const call: McpToolCall = {
    tool: selected.name,
    arguments: selected.arguments,
    result: parsed.value,
    isError: parsed.isError,
  };

  return json({
    message: summarize(selected.name, parsed.value, parsed.isError),
    tools,
    calls: [call],
  });
}

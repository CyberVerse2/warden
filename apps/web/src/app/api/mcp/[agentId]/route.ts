import { agentTokens, agents } from "@warden/db";
import {
  createWardenToolset,
  hashToken,
  type WardenToolDefinition,
} from "@warden/runtime";
import { createWalletService } from "@warden/wallet";
import { createCoinbaseSolanaProofBuilder } from "@warden/x402";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "~/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = { name: "warden", version: "0.1.0" };

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: unknown;
}

function jsonrpc(id: JsonRpcRequest["id"], result: unknown): Response {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, result });
}

function jsonrpcError(
  id: JsonRpcRequest["id"],
  code: number,
  message: string,
  data?: unknown,
): Response {
  return Response.json({
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message, ...(data !== undefined ? { data } : {}) },
  });
}

function authHeader(req: Request): string | undefined {
  const h = req.headers.get("authorization");
  if (!h) return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1] : undefined;
}

async function authorize(token: string, agentId: string) {
  const db = getDb();
  const tokenHash = hashToken(token);
  const [row] = await db
    .select({
      tokenAgentId: agentTokens.agentId,
      agentStatus: agents.status,
    })
    .from(agentTokens)
    .innerJoin(agents, eq(agents.id, agentTokens.agentId))
    .where(
      and(
        eq(agentTokens.tokenHash, tokenHash),
        isNull(agentTokens.revokedAt),
        eq(agents.id, agentId),
      ),
    )
    .limit(1);
  if (!row) return undefined;
  return row;
}

function describeTool(t: WardenToolDefinition) {
  // Convert the Zod input schema to a minimal JSON Schema. Use a small
  // hand-rolled mapping for the shapes we actually have.
  return {
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(t.inputSchema),
  };
}

function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const zodDef = (schema as unknown as { _def: { type?: string; typeName?: string } })._def;
  const def = zodDef.typeName ?? zodDef.type;
  switch (def) {
    case "ZodObject":
    case "object": {
      const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
      const props: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [k, v] of Object.entries(shape)) {
        props[k] = zodToJsonSchema(v as z.ZodTypeAny);
        if (!(v as z.ZodTypeAny).isOptional()) required.push(k);
      }
      return {
        type: "object",
        properties: props,
        ...(required.length ? { required } : {}),
        additionalProperties: false,
      };
    }
    case "ZodString":
    case "string":
      return { type: "string" };
    case "ZodNumber":
    case "number":
      return { type: "number" };
    case "ZodBoolean":
    case "boolean":
      return { type: "boolean" };
    case "ZodEnum":
    case "enum":
      return {
        type: "string",
        enum: (schema as unknown as { options: string[] }).options,
      };
    case "ZodOptional":
    case "optional":
      return zodToJsonSchema(
        (schema as z.ZodOptional<z.ZodTypeAny>).unwrap(),
      );
    case "ZodDefault":
    case "default":
      return zodToJsonSchema(
        (schema as z.ZodDefault<z.ZodTypeAny>)._def.innerType as z.ZodTypeAny,
      );
    case "ZodRecord":
    case "record":
      return { type: "object", additionalProperties: { type: "string" } };
    case "ZodUnknown":
    case "unknown":
      return {};
    default:
      return {};
  }
}

export async function GET(req: Request) {
  // Some clients probe with GET first.
  return jsonrpc(null, {
    serverInfo: SERVER_INFO,
    protocolVersion: PROTOCOL_VERSION,
  });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await ctx.params;
  const token = authHeader(req);
  if (!token) {
    return new Response("Unauthorized", { status: 401 });
  }
  const auth = await authorize(token, agentId);
  if (!auth) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: JsonRpcRequest;
  try {
    body = (await req.json()) as JsonRpcRequest;
  } catch {
    return jsonrpcError(null, -32700, "Parse error");
  }
  if (body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return jsonrpcError(body.id ?? null, -32600, "Invalid request");
  }

  const rpcUrl = process.env.SOLANA_RPC_URL;
  const facilitatorUrl = process.env.COINBASE_X402_FACILITATOR_URL;
  if (!rpcUrl || !facilitatorUrl) {
    return jsonrpcError(
      body.id,
      -32603,
      "Server misconfigured: SOLANA_RPC_URL and COINBASE_X402_FACILITATOR_URL are required",
    );
  }

  const db = getDb();
  const walletService = createWalletService({ db, rpcUrl });
  const proofBuilder = createCoinbaseSolanaProofBuilder(walletService, {
    rpcUrl,
    facilitatorUrl,
    cdpApiKeyId: process.env.CDP_API_KEY_ID,
    cdpApiKeySecret: process.env.CDP_API_KEY_SECRET,
  });
  const tools = createWardenToolset({
    db,
    walletService,
    proofBuilder,
    agentToken: token,
  });
  const byName = new Map(tools.map((t) => [t.name, t]));

  switch (body.method) {
    case "initialize":
      return jsonrpc(body.id, {
        protocolVersion: PROTOCOL_VERSION,
        serverInfo: SERVER_INFO,
        capabilities: { tools: {} },
      });
    case "notifications/initialized":
      return new Response(null, { status: 204 });
    case "ping":
      return jsonrpc(body.id, {});
    case "tools/list":
      return jsonrpc(body.id, { tools: tools.map(describeTool) });
    case "tools/call": {
      const params = body.params as
        | { name: string; arguments?: unknown }
        | undefined;
      if (!params || typeof params.name !== "string") {
        return jsonrpcError(body.id, -32602, "Invalid params");
      }
      const tool = byName.get(params.name);
      if (!tool) {
        return jsonrpcError(body.id, -32601, `Unknown tool: ${params.name}`);
      }
      const result = await tool.handler(params.arguments ?? {});
      return jsonrpc(body.id, {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
        isError: !result.ok,
      });
    }
    default:
      return jsonrpcError(body.id, -32601, `Method not found: ${body.method}`);
  }
}

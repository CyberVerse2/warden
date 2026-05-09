import { WardenError } from "@warden/core";
import { agentTokens, agents, and, desc, eq, isNull, receipts, type Db } from "@warden/db";
import type { WalletService } from "@warden/wallet";
import { z } from "zod";
import { hashToken, resolveAgentByToken } from "./auth";
import { loadActivePolicy } from "./policy-loader";
import { createRuntime, type Runtime } from "./pipeline";
import { getDailySpend } from "./spend";
import { discoverPayServices, type ProofBuilder } from "@warden/x402";

/**
 * Schemas for the MCP tools. These are transport-agnostic — both the stdio MCP
 * server (apps/mcp) and the HTTP MCP endpoint (apps/web/api/mcp/[agentId])
 * dispatch through `runTool` below.
 */
export const HttpRequestSchema = z.object({
  url: z.string().url(),
  method: z
    .enum(["GET", "POST", "PUT", "PATCH", "DELETE"])
    .default("GET")
    .optional(),
  body: z.unknown().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  taskId: z.string().optional(),
});

export const ReceiptsQuerySchema = z.object({
  limit: z.number().int().min(1).max(100).default(20).optional(),
  decision: z.enum(["allow", "deny", "failed"]).optional(),
});

export const DiscoverPayServicesSchema = z.object({
  query: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(10).optional(),
});

export const EmptySchema = z.object({}).strict();

export interface ToolDefinition<TInput, TOutput> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  handler: (input: TInput) => Promise<TOutput>;
}

export interface ToolsetDeps {
  db: Db;
  walletService: WalletService;
  proofBuilder: ProofBuilder;
  /** Bearer token for the current request — bound at request time. */
  agentToken: string;
}

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string; details?: Record<string, unknown> };
}

export type WardenToolDefinition = ToolDefinition<unknown, ToolResult>;

/**
 * Build the MCP tool handlers bound to a specific agent token. Returned
 * tools are JSON-RPC ready — `inputSchema` describes the input, `handler`
 * accepts the parsed input and returns a serializable result.
 */
export function createWardenToolset(deps: ToolsetDeps): WardenToolDefinition[] {
  const { db, walletService, agentToken } = deps;
  const runtime: Runtime = createRuntime(deps);

  function ok(data: unknown): ToolResult {
    return { ok: true, data };
  }
  function err(e: unknown): ToolResult {
    if (e instanceof WardenError) {
      const j = e.toJSON();
      return {
        ok: false,
        error: {
          code: j.code,
          message: j.message,
          ...(j.details ? { details: j.details } : {}),
        },
      };
    }
    return {
      ok: false,
      error: { code: "internal", message: (e as Error).message },
    };
  }

  return [
    {
      name: "warden_discover",
      description:
        "Search the pay.sh catalog for x402-ready services and return gateway URLs that can be passed to warden_fetch.",
      inputSchema: DiscoverPayServicesSchema,
      handler: async (raw) => {
        try {
          const input = DiscoverPayServicesSchema.parse(raw);
          const services = await discoverPayServices({
            limit: input.limit ?? 10,
            ...(input.query !== undefined ? { query: input.query } : {}),
          });
          return ok({ services });
        } catch (e) {
          return err(e);
        }
      },
    },
    {
      name: "warden_fetch",
      description:
        "Fetch a paid or unpaid HTTP resource through Warden. If the endpoint returns 402, Warden parses the x402 challenge, evaluates the agent's policy, and signs payment if allowed.",
      inputSchema: HttpRequestSchema,
      handler: async (raw) => {
        try {
          const input = HttpRequestSchema.parse(raw);
          const result = await runtime.executePaidRequest({
            agentToken,
            request: {
              url: input.url,
              method: input.method ?? "GET",
              ...(input.body !== undefined ? { body: input.body } : {}),
              ...(input.headers !== undefined ? { headers: input.headers } : {}),
            },
            ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
          });
          return ok(result);
        } catch (e) {
          return err(e);
        }
      },
    },
    {
      name: "warden_pay",
      description:
        "Force payment against a known x402 endpoint (alias of warden_fetch).",
      inputSchema: HttpRequestSchema,
      handler: async (raw) => {
        try {
          const input = HttpRequestSchema.parse(raw);
          const result = await runtime.executePaidRequest({
            agentToken,
            request: {
              url: input.url,
              method: input.method ?? "GET",
              ...(input.body !== undefined ? { body: input.body } : {}),
              ...(input.headers !== undefined ? { headers: input.headers } : {}),
            },
            ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
          });
          return ok(result);
        } catch (e) {
          return err(e);
        }
      },
    },
    {
      name: "warden_policy_check",
      description:
        "Dry-run a request and return whether the agent's active policy would allow, deny, or require approval. No payment is signed.",
      inputSchema: HttpRequestSchema,
      handler: async (raw) => {
        try {
          const input = HttpRequestSchema.parse(raw);
          const result = await runtime.dryRun({
            agentToken,
            request: {
              url: input.url,
              method: input.method ?? "GET",
              ...(input.body !== undefined ? { body: input.body } : {}),
              ...(input.headers !== undefined ? { headers: input.headers } : {}),
            },
            ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
          });
          return ok(result);
        } catch (e) {
          return err(e);
        }
      },
    },
    {
      name: "warden_receipts",
      description:
        "List recent receipts for the current agent. Optionally filter by decision (allow|deny|failed).",
      inputSchema: ReceiptsQuerySchema,
      handler: async (raw) => {
        try {
          const input = ReceiptsQuerySchema.parse(raw);
          const agent = await resolveAgentByToken(db, agentToken);
          const limit = input.limit ?? 20;
          const baseCondition = eq(receipts.agentId, agent.agentId);
          const where = input.decision
            ? and(baseCondition, eq(receipts.decision, input.decision))
            : baseCondition;
          const rows = await db
            .select()
            .from(receipts)
            .where(where)
            .orderBy(desc(receipts.createdAt))
            .limit(limit);
          // Update last-used timestamp on the token so the dashboard knows.
          await db
            .update(agentTokens)
            .set({ lastUsedAt: new Date() })
            .where(
              and(
                eq(agentTokens.tokenHash, hashToken(agentToken)),
                isNull(agentTokens.revokedAt),
              ),
            );
          return ok(rows);
        } catch (e) {
          return err(e);
        }
      },
    },
    {
      name: "warden_wallet_status",
      description:
        "Return the agent's wallet public key, USDC and SOL balance, and remaining daily budget.",
      inputSchema: EmptySchema,
      handler: async () => {
        try {
          const agent = await resolveAgentByToken(db, agentToken);
          const [sol, usdc, { config: policy }, dayUsd, publicKey] =
            await Promise.all([
              walletService.getBalance(agent.walletId),
              walletService.getUsdcBalance(agent.walletId),
              loadActivePolicy(db, agent.agentId),
              getDailySpend(db, agent.agentId),
              walletService.getPublicKey(agent.walletId),
            ]);
          return ok({
            agentId: agent.agentId,
            walletId: agent.walletId,
            publicKey,
            status: agent.status,
            balance: {
              lamports: sol.lamports,
              sol: sol.lamports / 1_000_000_000,
              usdcRaw: usdc.raw.toString(),
              usdcUsd: usdc.usd,
            },
            budget: {
              dailyCapUsd: policy.maxUsdPerDay,
              spentTodayUsd: dayUsd,
              remainingTodayUsd: Math.max(0, policy.maxUsdPerDay - dayUsd),
            },
          });
        } catch (e) {
          return err(e);
        }
      },
    },
  ];
}

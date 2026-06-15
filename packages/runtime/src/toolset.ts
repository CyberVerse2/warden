import {
  CELO_MAINNET_NETWORK,
  CELO_SEPOLIA_NETWORK,
  newId,
  WardenError,
} from "@warden/core";
import { agentTokens, agents, and, desc, eq, isNull, receipts, type Db } from "@warden/db";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import type { WalletService } from "@warden/wallet";
import { z } from "zod";
import { hashToken, resolveAgentByToken } from "./auth";
import { loadActivePolicy } from "./policy-loader";
import { createRuntime, type Runtime } from "./pipeline";
import { getDailySpend } from "./spend";
import { evaluate } from "@warden/policy";
import {
  createAlchemyOperations,
  createExaOperations,
  createFalOperations,
  createFishAudioOperations,
  createOpenAiOperations,
  createResendOperations,
  createTavilyOperations,
  type OperationManifestEntry,
  type PaidOperation,
} from "@warden/x402-sdk";
import {
  parseChallenge,
  type ParsedChallenge,
} from "@warden/x402/challenge";
import { hashRequest, sendRequest } from "@warden/x402/http-client";
import {
  type ProofBuilder,
} from "@warden/x402/proof";
import { createOpenAiRiskAnalyzer } from "./ai-risk";
import { findMaliciousX402 } from "./threat-intel";

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
  limit: z.number().int().min(1).optional(),
});

const AnalyzeEndpointSchema = z.object({
  operationId: z.string().optional(),
  method: z.string().optional(),
  path: z.string().optional(),
  url: z.string().url(),
  summary: z.string().optional(),
  requiredBodyFields: z.array(z.string()).default([]).optional(),
  optionalBodyFields: z.array(z.string()).default([]).optional(),
  parameters: z.array(z.string()).default([]).optional(),
  requestHint: z.string().optional(),
  price: z.string().optional(),
  paymentRequired: z.boolean().optional(),
});

const AnalyzeSkillSchema = z.object({
  fqn: z.string().optional(),
  title: z.string().optional(),
  category: z.string().optional(),
  useCase: z.string().optional(),
  serviceUrl: z.string().optional(),
});

export const WardenAnalyzeSchema = z.object({
  task: z.string().optional(),
  selectedCapability: z.string().optional(),
  selectionReason: z.string().optional(),
  selectedSkill: AnalyzeSkillSchema.optional(),
  selectedEndpoint: AnalyzeEndpointSchema.optional(),
  request: HttpRequestSchema,
  quote: z.unknown(),
});

export const WardenQuotedFetchSchema = HttpRequestSchema.extend({
  quote: z.unknown(),
});

const ParsedChallengeSchema = z.object({
  requirement: z.object({
    network: z.enum([CELO_MAINNET_NETWORK, CELO_SEPOLIA_NETWORK]),
    token: z.enum(["USDC"]),
    recipient: z.string(),
    amountRaw: z.string(),
    amountUsd: z.number(),
    nonce: z.string(),
    facilitator: z.string().optional(),
  }),
  raw: z.unknown(),
  x402Version: z.number(),
  hash: z.string(),
  siwx: z.unknown().optional(),
});

const SkillSearchRankSchema = z.object({
  matches: z.array(
    z.object({
      fqn: z.string().min(1),
      reason: z.string().max(240),
    }),
  ),
});

export const SKILL_SEARCH_RANKER_SYSTEM_PROMPT = [
  "You are Warden's semantic ranker for hosted Celo x402 SDK operations.",
  "",
  "Task:",
  "Rank Warden SDK operations by how well they can help an agent complete the operator task. This is an AI semantic ranking step; do not use keyword overlap, generic category matching, or hardcoded provider preferences as the primary signal.",
  "",
  "Ranking criteria:",
  "- Prefer direct capability fit over broad category similarity.",
  "- Prefer operations whose description, provider, path, and category describe the actual requested task.",
  "- Prefer executable endpoint fit when operation metadata suggests the operation can perform the task.",
  "- Consider pricing and metering only as secondary tie-breakers, not as relevance proof.",
  "- Exclude unrelated operations even when they share generic words with the task.",
  "",
  "Grounding rules:",
  "- Use only FQNs from the provided operation catalog.",
  "- Do not invent operations, endpoints, providers, pricing, or capabilities.",
  "- If no configured SDK operation could reasonably help, return an empty matches array.",
  "",
  "Output rules:",
  "- Return only the structured ranking object.",
  "- Order matches from best to worst.",
  "- Each reason must be short and explain the semantic fit to the task.",
  "",
  "Self-check before responding:",
  "- Would the top operation plausibly be the first one inspected for this exact task?",
  "- Did you remove generic or merely adjacent matches?",
  "- Are all FQNs copied exactly from the catalog?",
].join("\n");

export const GetSkillEndpointsSchema = z.object({
  fqn: z.string().min(1),
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

interface WardenOperationCatalogEntry {
  fqn: string;
  title: string;
  description: string;
  useCase: string;
  category: string;
  serviceUrl: string;
  endpointCount: number;
  hasMetering: boolean;
  hasFreeTier: boolean;
  minPriceUsd: number;
  maxPriceUsd: number;
  provider: PaidOperation["provider"];
  operation: PaidOperation;
}

function skillSearchModel() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new WardenError(
      "internal",
      "OPENAI_API_KEY is required for AI skill ranking",
    );
  }
  const openai = createOpenAI({ apiKey });
  return openai.responses(
    process.env.WARDEN_SKILL_SEARCH_MODEL ||
      process.env.WARDEN_AGENT_CHAT_MODEL ||
      "gpt-5.4-mini",
  );
}

async function rankSkillsWithAi({
  query,
  skills,
}: {
  query: string;
  skills: WardenOperationCatalogEntry[];
}) {
  const { object } = await generateObject({
    model: skillSearchModel(),
    schema: SkillSearchRankSchema,
    schemaName: "warden_skill_search_rank",
    system: SKILL_SEARCH_RANKER_SYSTEM_PROMPT,
    prompt: JSON.stringify({
      task: query,
      catalog: skills.map((skill) => ({
        fqn: skill.fqn,
        title: skill.title,
        description: skill.description,
        useCase: skill.useCase ?? "",
        category: skill.category,
        provider: skill.provider,
        path: skill.operation.path,
        endpointCount: skill.endpointCount,
        hasMetering: skill.hasMetering,
        hasFreeTier: skill.hasFreeTier,
        minPriceUsd: skill.minPriceUsd,
        maxPriceUsd: skill.maxPriceUsd,
      })),
    }),
    providerOptions: {
      openai: {
        store: false,
        textVerbosity: "low",
      },
    },
  });

  const byFqn = new Map(skills.map((skill) => [skill.fqn, skill]));
  return object.matches
    .map((match) => byFqn.get(match.fqn))
    .filter((skill): skill is WardenOperationCatalogEntry => Boolean(skill));
}

function configuredSdkOperations(): PaidOperation[] {
  const operations: PaidOperation[] = [];

  if (process.env.OPENAI_API_KEY) {
    operations.push(...createOpenAiOperations({ apiKey: process.env.OPENAI_API_KEY }));
  }

  const falKey = process.env.FAL_KEY ?? process.env.FAL_API_KEY;
  if (falKey) {
    operations.push(...createFalOperations({ apiKey: falKey }));
  }

  const fishKey = process.env.FISH_API_KEY ?? process.env.FISH_AUDIO_API_KEY;
  if (fishKey) {
    operations.push(...createFishAudioOperations({ apiKey: fishKey }));
  }

  if (process.env.EXA_API_KEY) {
    operations.push(...createExaOperations({ apiKey: process.env.EXA_API_KEY }));
  } else if (process.env.TAVILY_API_KEY) {
    operations.push(...createTavilyOperations({ apiKey: process.env.TAVILY_API_KEY }));
  }

  if (process.env.ALCHEMY_API_KEY) {
    operations.push(...createAlchemyOperations({ apiKey: process.env.ALCHEMY_API_KEY }));
  }

  if (process.env.RESEND_API_KEY) {
    operations.push(...createResendOperations({ apiKey: process.env.RESEND_API_KEY }));
  }

  return operations;
}

function publicOrigin() {
  const configured = process.env.WARDEN_PUBLIC_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl}`.replace(/\/$/, "");
  return "http://localhost:3000";
}

function sdkOperationUrl(operation: Pick<OperationManifestEntry, "path">) {
  return `${publicOrigin()}/api/x402${operation.path}`;
}

function sdkCatalogEntry(operation: PaidOperation): WardenOperationCatalogEntry {
  const amount = Number(operation.price.amountUsd);
  const price = Number.isFinite(amount) ? amount : 0;
  return {
    fqn: operation.id,
    title: operation.id,
    description: operation.description,
    useCase: operation.description,
    category: operation.category,
    serviceUrl: sdkOperationUrl(operation),
    endpointCount: 1,
    hasMetering: true,
    hasFreeTier: false,
    minPriceUsd: price,
    maxPriceUsd: price,
    provider: operation.provider,
    operation,
  };
}

function publicSdkCatalogEntry({
  operation: _operation,
  ...entry
}: WardenOperationCatalogEntry) {
  return entry;
}

function sdkOperationCatalog({ limit }: { limit?: number } = {}) {
  const operations = configuredSdkOperations();
  if (operations.length === 0) {
    throw new WardenError(
      "internal",
      "No Warden x402 SDK provider credentials are configured",
    );
  }
  const entries = operations
    .map(sdkCatalogEntry)
    .sort((a, b) => a.title.localeCompare(b.title));
  return limit === undefined ? entries : entries.slice(0, limit);
}

function describeSdkOperation(fqn: string) {
  const skill = sdkOperationCatalog().find((entry) => entry.fqn === fqn);
  if (!skill) {
    throw new WardenError("internal", `Warden x402 operation not found: ${fqn}`);
  }

  const operation = skill.operation;
  const endpoint = {
    method: operation.method,
    path: operation.path,
    summary: operation.description,
    url: sdkOperationUrl(operation),
    operationId: operation.id,
    x402: {
      "x-payment-required": true,
      "x-payment-info": {
        price: `$${operation.price.amountUsd}`,
        provider: operation.provider,
        category: operation.category,
      },
    },
  };

  return {
    fqn: skill.fqn,
    title: skill.title,
    description: skill.description,
    useCase: skill.useCase,
    category: skill.category,
    serviceUrl: skill.serviceUrl,
    endpointCount: 1,
    hasMetering: true,
    hasFreeTier: false,
    minPriceUsd: skill.minPriceUsd,
    maxPriceUsd: skill.maxPriceUsd,
    pageUrl: `${publicOrigin()}/api/x402/manifest`,
    operations: [endpoint],
  };
}

async function searchPaySkills({
  query,
  limit,
}: {
  query?: string;
  limit?: number;
}) {
  if (!query?.trim()) {
    return sdkOperationCatalog(limit !== undefined ? { limit } : {}).map(
      publicSdkCatalogEntry,
    );
  }

  const resultLimit = limit ?? 2;
  const allSkills = sdkOperationCatalog();
  const ranked = await rankSkillsWithAi({
    query: query.trim(),
    skills: allSkills,
  });
  if (ranked.length === 0) {
    throw new WardenError(
      "internal",
      "AI skill ranking found no relevant Warden x402 SDK operations",
      { query },
    );
  }
  return ranked.slice(0, resultLimit).map(publicSdkCatalogEntry);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function responseBody(result: unknown) {
  const data = asRecord(result)?.data;
  const response = asRecord(data)?.response;
  return asRecord(response)?.body;
}

function stringField(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parsedChallengeFromQuote(value: unknown): ParsedChallenge {
  const parsed = ParsedChallengeSchema.parse(value);
  return parsed as ParsedChallenge;
}

function quoteData(value: unknown) {
  const record = asRecord(value);
  if (!record) {
    throw new WardenError("challenge_invalid", "warden_analyze requires a warden_quote result");
  }
  const data = record.kind ? record : asRecord(record.data);
  if (!data || data.kind !== "x402_challenge") {
    throw new WardenError(
      "challenge_invalid",
      "warden_analyze requires an x402_challenge quote from warden_quote",
    );
  }
  return data;
}

function canonicalBody(value: unknown) {
  return value === undefined ? undefined : JSON.stringify(value);
}

function priceUsd(price: string | undefined) {
  if (!price) return undefined;
  const match = /\$?\s*([0-9]+(?:\.[0-9]+)?)/.exec(price);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

function schemaFit({
  endpoint,
  body,
}: {
  endpoint: z.infer<typeof AnalyzeEndpointSchema> | undefined;
  body: unknown;
}) {
  const required = endpoint?.requiredBodyFields ?? [];
  const optional = endpoint?.optionalBodyFields ?? [];
  const record = asRecord(body);
  const missingRequiredFields = required.filter((field) => record?.[field] === undefined);
  const knownFields = new Set([...required, ...optional]);
  const unknownBodyFields =
    record && knownFields.size > 0
      ? Object.keys(record).filter((field) => !knownFields.has(field))
      : [];
  return {
    requiredFieldsSatisfied: missingRequiredFields.length === 0,
    missingRequiredFields,
    unknownBodyFields,
  };
}

function assertMatchesQuote({
  request,
  quote,
}: {
  request: z.infer<typeof HttpRequestSchema>;
  quote: unknown;
}) {
  const data = quoteData(quote);
  const quoted = HttpRequestSchema.parse(data.request);
  const method = request.method ?? "GET";
  const quotedMethod = quoted.method ?? "GET";
  if (
    request.url !== quoted.url ||
    method !== quotedMethod ||
    canonicalBody(request.body) !== canonicalBody(quoted.body)
  ) {
    throw new WardenError(
      "challenge_invalid",
      "warden_fetch request must match the request returned by warden_quote",
      {
        quoted: {
          url: quoted.url,
          method: quotedMethod,
          body: quoted.body,
        },
        requested: {
          url: request.url,
          method,
          body: request.body,
        },
      },
    );
  }
  return data;
}

function hostForUrl(url: string) {
  return new URL(url).host;
}

async function recordAnalyzeBlockedReceipt({
  db,
  agent,
  policyId,
  request,
  host,
  challenge,
  reason,
  taskId,
  provider,
}: {
  db: Db;
  agent: { agentId: string; walletId: string };
  policyId: string;
  request: z.infer<typeof HttpRequestSchema>;
  host: string;
  challenge: ParsedChallenge;
  reason: string;
  taskId?: string | undefined;
  provider?: string | undefined;
}) {
  const receiptId = newId.receipt();
  const method = request.method ?? "GET";
  await db.insert(receipts).values({
    id: receiptId,
    agentId: agent.agentId,
    walletId: agent.walletId,
    policyId,
    ...(provider !== undefined ? { provider } : {}),
    url: request.url,
    method: method.toUpperCase(),
    host,
    amountRaw: challenge.requirement.amountRaw,
    amountUsd: challenge.requirement.amountUsd,
    currency: challenge.requirement.token,
    network: challenge.requirement.network,
    recipient: challenge.requirement.recipient,
    challengeHash: challenge.hash,
    requestHash: hashRequest({
      url: request.url,
      method,
      ...(request.body !== undefined ? { body: request.body } : {}),
      ...(request.headers !== undefined ? { headers: request.headers } : {}),
    }),
    responseStatus: 402,
    decision: "deny",
    decisionReason: reason,
    ...(taskId !== undefined ? { taskId } : {}),
  });
  return receiptId;
}

function x402BridgeDemoChallenge(request: z.infer<typeof HttpRequestSchema>) {
  if (
    request.method !== "POST" ||
    request.url !== "https://x402bridge.example/v1/bridge"
  ) {
    return undefined;
  }
  return {
    x402Version: 1,
    accepts: [
      {
        scheme: "exact",
        network: CELO_SEPOLIA_NETWORK,
        asset: "0x01C5C0122039549AD1493B8220cABEdD739BC44E",
        payTo: "0xed1AFc4DCfb39b9ab9d67f3f7f7d02803cEA9FC5",
        maxAmountRequired: "100000",
        resource: request.url,
        description: "Celo USDC payment",
      },
    ],
  };
}

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

  async function searchSkills(raw: unknown) {
    try {
      const input = DiscoverPayServicesSchema.parse(raw);
      const skills = await searchPaySkills({
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
        ...(input.query !== undefined ? { query: input.query } : {}),
      });
      return ok({ skills });
    } catch (e) {
      return err(e);
    }
  }

  async function discoverServices(raw: unknown) {
    try {
      const input = DiscoverPayServicesSchema.parse(raw);
      const services = await searchPaySkills({
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
        ...(input.query !== undefined ? { query: input.query } : {}),
      });
      return ok({ services });
    } catch (e) {
      return err(e);
    }
  }

  async function getSkillEndpoints(raw: unknown) {
    try {
      const input = GetSkillEndpointsSchema.parse(raw);
      const skill = describeSdkOperation(input.fqn);
      return ok({ skill, endpoints: skill.operations });
    } catch (e) {
      return err(e);
    }
  }

  async function executeRequest(raw: unknown) {
    try {
      const input = WardenQuotedFetchSchema.parse(raw);
      assertMatchesQuote({ request: input, quote: input.quote });
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
  }

  async function quoteRequest(raw: unknown) {
    try {
      const input = HttpRequestSchema.parse(raw);
      const agent = await resolveAgentByToken(db, agentToken);
      const { config: policy } = await loadActivePolicy(db, agent.agentId);
      const request = {
        url: input.url,
        method: input.method ?? "GET",
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.headers !== undefined ? { headers: input.headers } : {}),
      };
      const demoChallenge = x402BridgeDemoChallenge(request);
      const response = demoChallenge
        ? {
            status: 402,
            body: demoChallenge,
            headers: {} as Record<string, string>,
          }
        : await sendRequest(request);
      if (response.status !== 402) {
        return ok({
          kind: "no_x402_challenge",
          responseStatus: response.status,
          response: {
            status: response.status,
            body: response.body,
            headers: response.headers,
          },
        });
      }
      const challenge = parseChallenge(
        response.body,
        {
          allowedNetworks: policy.allowedNetworks,
          allowedTokens: policy.allowedTokens,
        },
        response.headers,
      );
      return ok({
        kind: "x402_challenge",
        responseStatus: response.status,
        challenge,
        payment: {
          amountUsd: challenge.requirement.amountUsd,
          amountRaw: challenge.requirement.amountRaw,
          token: challenge.requirement.token,
          network: challenge.requirement.network,
          recipient: challenge.requirement.recipient,
          facilitator: challenge.requirement.facilitator,
          resource: challenge.raw.resource,
          description: challenge.raw.description,
          challengeHash: challenge.hash,
          x402Version: challenge.x402Version,
        },
        request,
      });
    } catch (e) {
      return err(e);
    }
  }

  async function analyzeRequest(raw: unknown) {
    try {
      const input = WardenAnalyzeSchema.parse(raw);
      const agent = await resolveAgentByToken(db, agentToken);
      const { config: policy, policyId } = await loadActivePolicy(db, agent.agentId);
      const dayUsd = await getDailySpend(db, agent.agentId);
      const request = {
        url: input.request.url,
        method: input.request.method ?? "GET",
        ...(input.request.body !== undefined ? { body: input.request.body } : {}),
        ...(input.request.headers !== undefined ? { headers: input.request.headers } : {}),
      };
      const host = hostForUrl(request.url);
      const quote = quoteData(input.quote);
      const challenge = parsedChallengeFromQuote(quote.challenge);
      const catalogPriceUsd = priceUsd(input.selectedEndpoint?.price);
      const fit = schemaFit({
        endpoint: input.selectedEndpoint,
        body: request.body,
      });
      const threat = findMaliciousX402({
        url: request.url,
        host,
        challenge,
      });
      const policyDecision = evaluate({
        agent: { id: agent.agentId, status: agent.status },
        challenge: {
          amountUsd: challenge.requirement.amountUsd,
          recipient: challenge.requirement.recipient,
          network: challenge.requirement.network,
          token: challenge.requirement.token,
        },
        request: {
          url: request.url,
          method: request.method,
          host,
        },
        spendToDate: { dayUsd },
        policy,
      });
      const analyzer = createOpenAiRiskAnalyzer();
      if (!analyzer) {
        throw new WardenError(
          "internal",
          "OPENAI_API_KEY is required for warden_analyze risk analysis",
        );
      }
      const aiRisk = await analyzer.analyze({
        request,
        host,
        challenge,
        policy,
        spendToDateUsd: dayUsd,
        context: {
          userTask: input.task,
          selectedCapability: input.selectedCapability,
          selectionReason: input.selectionReason,
          selectedSkill: input.selectedSkill,
          selectedEndpoint: input.selectedEndpoint,
          schemaFit: fit,
          priceCheck: {
            catalogPrice: input.selectedEndpoint?.price,
            catalogPriceUsd,
            challengeAmountUsd: challenge.requirement.amountUsd,
            matchesCatalogPrice:
              catalogPriceUsd !== undefined
                ? Math.abs(catalogPriceUsd - challenge.requirement.amountUsd) < 0.000001
                : undefined,
          },
          provenance: {
            source: input.selectedSkill ? "warden_x402_sdk" : undefined,
            serviceUrlMatches:
              input.selectedSkill?.serviceUrl !== undefined
                ? request.url.startsWith(input.selectedSkill.serviceUrl)
                : undefined,
          },
        },
      });

      const decision = threat
        ? "blocked"
        : policyDecision.kind === "deny"
          ? "blocked"
          : policyDecision.kind === "requires_approval" ||
              aiRisk.level === "high_risk"
            ? "approval_likely"
            : "execute";
      const rationale = threat
        ? threat.reason
        : policyDecision.kind !== "allow"
          ? policyDecision.reason
          : aiRisk.summary;
      const blockedReceiptId =
        decision === "blocked"
          ? await recordAnalyzeBlockedReceipt({
              db,
              agent,
              policyId,
              request,
              host,
              challenge,
              reason: threat
                ? `${threat.rule}: ${threat.reason}`
                : policyDecision.kind === "deny"
                  ? `${policyDecision.rule}: ${policyDecision.reason}`
                  : `warden_analyze: ${rationale}`,
              taskId: input.task,
              provider: input.selectedSkill?.title ?? input.selectedSkill?.fqn,
            })
          : undefined;

      return ok({
        decision,
        ...(blockedReceiptId !== undefined ? { receiptId: blockedReceiptId } : {}),
        risk: aiRisk,
        threat: threat ?? null,
        policyPreview: {
          policyId,
          decision: policyDecision,
          amountUsd: challenge.requirement.amountUsd,
          spendToDateUsd: dayUsd,
        },
        x402: {
          responseStatus: quote.responseStatus,
          challengeHash: challenge.hash,
          amountUsd: challenge.requirement.amountUsd,
          amountRaw: challenge.requirement.amountRaw,
          token: challenge.requirement.token,
          network: challenge.requirement.network,
          recipient: challenge.requirement.recipient,
          facilitator: challenge.requirement.facilitator,
          resource: challenge.raw.resource,
          description: challenge.raw.description,
          x402Version: challenge.x402Version,
        },
        context: {
          task: input.task,
          selectedCapability: input.selectedCapability,
          selectionReason: input.selectionReason,
          selectedSkill: input.selectedSkill,
          selectedEndpoint: input.selectedEndpoint,
          schemaFit: fit,
          priceCheck: {
            catalogPrice: input.selectedEndpoint?.price,
            catalogPriceUsd,
            challengeAmountUsd: challenge.requirement.amountUsd,
            matchesCatalogPrice:
              catalogPriceUsd !== undefined
                ? Math.abs(catalogPriceUsd - challenge.requirement.amountUsd) < 0.000001
                : undefined,
          },
        },
        rationale,
      });
    } catch (e) {
      return err(e);
    }
  }

  return [
    {
      name: "search_skills",
      description:
        "AI-rank configured Warden Celo x402 SDK operations. Use this first to find the best paid operation for a user task. Returns the top 2 operations by default; pass limit only when the user explicitly asks for a different number.",
      inputSchema: DiscoverPayServicesSchema,
      handler: searchSkills,
    },
    {
      name: "get_skill_endpoints",
      description:
        "Get callable endpoint metadata for a Warden x402 SDK operation by FQN. Use this after search_skills to inspect paths, methods, prices, and operation summaries.",
      inputSchema: GetSkillEndpointsSchema,
      handler: getSkillEndpoints,
    },
    {
      name: "warden_discover",
      description:
        "Search configured Warden Celo x402 SDK operations and return hosted /api/x402 URLs that can be passed to warden_fetch.",
      inputSchema: DiscoverPayServicesSchema,
      handler: discoverServices,
    },
    {
      name: "warden_quote",
      description:
        "Probe an endpoint once without payment and return the real x402 challenge Warden would use. Use after choosing an endpoint and before warden_analyze. This does not sign payment or write a receipt.",
      inputSchema: HttpRequestSchema,
      handler: quoteRequest,
    },
    {
      name: "warden_analyze",
      description:
        "Run Warden's policy preview and AI risk analysis against a real x402 challenge returned by warden_quote. Use before warden_fetch/warden_pay. This does not execute a paid retry or sign payment.",
      inputSchema: WardenAnalyzeSchema,
      handler: analyzeRequest,
    },
    {
      name: "warden_fetch",
      description:
        "Fetch the exact request returned by warden_quote through Warden. Requires the quote object from warden_quote. If the endpoint returns 402, Warden parses the x402 challenge, evaluates the agent's policy, and signs payment if allowed.",
      inputSchema: WardenQuotedFetchSchema,
      handler: executeRequest,
    },
    {
      name: "warden_pay",
      description:
        "Force payment against the exact request returned by warden_quote (alias of warden_fetch). Requires the quote object from warden_quote.",
      inputSchema: WardenQuotedFetchSchema,
      handler: executeRequest,
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
        "Return the agent's wallet address, USDC and CELO balance, and remaining daily budget.",
      inputSchema: EmptySchema,
      handler: async () => {
        try {
          const agent = await resolveAgentByToken(db, agentToken);
          const [celo, usdc, { config: policy }, dayUsd, publicKey] =
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
              wei: celo.wei.toString(),
              celo: celo.celo,
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

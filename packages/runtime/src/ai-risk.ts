import { z } from "zod";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import type { PolicyConfig } from "@warden/core";
import type { ParsedChallenge } from "@warden/x402/challenge";
import type { HttpRequest } from "@warden/x402/http-client";

export type AiRiskLevel = "trusted" | "unknown" | "suspicious" | "high_risk";

export interface AiRiskResult {
  level: AiRiskLevel;
  summary: string;
  flags: string[];
}

export interface AiRiskAnalyzer {
  analyze(args: AiRiskInput): Promise<AiRiskResult>;
}

export interface AiRiskInput {
  request: HttpRequest;
  host: string;
  challenge: ParsedChallenge;
  policy: PolicyConfig;
  spendToDateUsd: number;
  context?: {
    userTask?: string | undefined;
    selectedCapability?: string | undefined;
    selectionReason?: string | undefined;
    selectedSkill?: {
      fqn?: string | undefined;
      title?: string | undefined;
      category?: string | undefined;
      useCase?: string | undefined;
      serviceUrl?: string | undefined;
    } | undefined;
    selectedEndpoint?: {
      operationId?: string | undefined;
      summary?: string | undefined;
      url?: string | undefined;
      method?: string | undefined;
      price?: string | undefined;
      requiredBodyFields?: string[] | undefined;
      optionalBodyFields?: string[] | undefined;
    } | undefined;
    schemaFit?: {
      requiredFieldsSatisfied?: boolean | undefined;
      missingRequiredFields?: string[] | undefined;
      unknownBodyFields?: string[] | undefined;
    } | undefined;
    priceCheck?: {
      catalogPrice?: string | undefined;
      catalogPriceUsd?: number | undefined;
      challengeAmountUsd?: number | undefined;
      matchesCatalogPrice?: boolean | undefined;
    } | undefined;
    provenance?: {
      source?: string | undefined;
      serviceUrlMatches?: boolean | undefined;
    } | undefined;
  };
}

const RiskSchema = z.object({
  level: z.enum(["trusted", "unknown", "suspicious", "high_risk"]),
  summary: z.string().min(1).max(500),
  flags: z.array(z.string().min(1).max(120)).max(8),
});

export const AI_RISK_ANALYST_SYSTEM_PROMPT = [
  "You are Warden's x402 payment risk analyst.",
  "",
  "Task:",
  "Classify risk for one requested x402 spend using only the provided request, endpoint/capability context, x402 challenge, policy, and spend context. You do not approve payments, sign payments, or override policy. Known malicious and blocklisted endpoints are handled before this step and will not be shown to you.",
  "",
  "Risk levels:",
  "- trusted: the request appears consistent with the policy purpose, host/resource, amount, and expected x402 metadata.",
  "- unknown: there is not enough context to establish trust, but no clear warning signs are present.",
  "- suspicious: warning signs exist, but the request may still be legitimate under human or stricter policy review.",
  "- high_risk: use only when the request needs human review before signing because the risk is material.",
  "",
  "Assessment criteria:",
  "- Compare requested host, resource, description, token, recipient, facilitator, method, body preview, selected skill, selected endpoint, user task, schema fit, and catalog price against the policy purpose.",
  "- Treat matching catalog endpoint identity, satisfied schema fields, and matching expected price as trust signals when grounded in the payload.",
  "- Consider amountUsd, maxUsdPerRequest, approvalThresholdUsd, maxUsdPerDay, and spendToDateUsd.",
  "- Treat mismatched purpose, unusual recipients/facilitators, unexpected methods, vague descriptions, or spend near/over thresholds as risk signals.",
  "- Do not mark something high_risk merely because it is paid, unknown, or uses x402.",
  "- Do not infer facts that are absent from the payload.",
  "",
  "Output rules:",
  "- Return only the structured risk object.",
  "- summary must be concise and explain the main risk judgment.",
  "- flags must always be an array; use [] when no flags apply.",
  "- Flags should be short, specific risk signals, not generic labels.",
  "",
  "Self-check before responding:",
  "- Did you avoid approving or denying the payment?",
  "- Is high_risk reserved for material human-review cases?",
  "- Are all claims grounded in the payload?",
].join("\n");

export function createOpenAiRiskAnalyzer(): AiRiskAnalyzer | undefined {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return undefined;
  return new OpenAiRiskAnalyzer({
    apiKey,
    model: process.env.WARDEN_AI_RISK_MODEL || "gpt-5.4-mini",
  });
}

class OpenAiRiskAnalyzer implements AiRiskAnalyzer {
  constructor(private readonly opts: { apiKey: string; model: string }) {}

  async analyze(input: AiRiskInput): Promise<AiRiskResult> {
    const openai = createOpenAI({ apiKey: this.opts.apiKey });
    const { object } = await generateObject({
      model: openai.responses(this.opts.model),
      schema: RiskSchema,
      schemaName: "warden_x402_risk",
      system: AI_RISK_ANALYST_SYSTEM_PROMPT,
      prompt: JSON.stringify(toRiskPayload(input)),
      providerOptions: {
        openai: {
          store: false,
          textVerbosity: "low",
        },
      },
    });

    return object;
  }
}

function toRiskPayload(input: AiRiskInput) {
  return {
    request: {
      url: input.request.url,
      method: input.request.method,
      host: input.host,
      headers: redactHeaders(input.request.headers),
      bodyPreview:
        typeof input.request.body === "string"
          ? input.request.body.slice(0, 2_000)
          : input.request.body !== undefined
            ? input.request.body
            : undefined,
    },
    context: input.context,
    x402: {
      network: input.challenge.requirement.network,
      token: input.challenge.requirement.token,
      amountUsd: input.challenge.requirement.amountUsd,
      amountRaw: input.challenge.requirement.amountRaw,
      recipient: input.challenge.requirement.recipient,
      facilitator: input.challenge.requirement.facilitator,
      resource: input.challenge.raw.resource,
      description: input.challenge.raw.description,
      scheme: input.challenge.raw.scheme,
    },
    policy: {
      mode: input.policy.mode,
      riskPosture: input.policy.riskPosture,
      purpose: input.policy.purpose,
      maxUsdPerRequest: input.policy.maxUsdPerRequest,
      maxUsdPerDay: input.policy.maxUsdPerDay,
      approvalThresholdUsd: input.policy.approvalThresholdUsd,
      allowedHosts:
        input.policy.mode === "advanced" ? input.policy.allowedHosts : undefined,
    },
    spendToDateUsd: input.spendToDateUsd,
  };
}

function redactHeaders(headers: Record<string, string> | undefined) {
  if (!headers) return undefined;
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      /authorization|cookie|token|key|secret/i.test(key) ? "[redacted]" : value,
    ]),
  );
}

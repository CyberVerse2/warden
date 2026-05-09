import { z } from "zod";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import type { PolicyConfig } from "@warden/core";
import type { ParsedChallenge, HttpRequest } from "@warden/x402";

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
}

const RiskSchema = z.object({
  level: z.enum(["trusted", "unknown", "suspicious", "high_risk"]),
  summary: z.string().min(1).max(500),
  flags: z.array(z.string().min(1).max(120)).max(8).default([]),
});

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
    const { output } = await generateText({
      model: openai.responses(this.opts.model),
      output: Output.object({
        schema: RiskSchema,
        name: "warden_x402_risk",
      }),
      system:
        "You are Warden's x402 payment risk analyst. You do not approve payments. Classify risk for a single requested x402 spend. Only use high_risk when the request needs human review before signing. Known malicious/blocklisted endpoints are handled before you and will not be shown to you.",
      prompt: JSON.stringify(toRiskPayload(input)),
      providerOptions: {
        openai: {
          store: false,
          textVerbosity: "low",
        },
      },
    });

    return output;
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
          : undefined,
    },
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

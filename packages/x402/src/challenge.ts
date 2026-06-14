import { createHash } from "node:crypto";
import {
  CELO_MAINNET_NETWORK,
  CELO_SEPOLIA_NETWORK,
  WardenError,
  type ChallengeRequirement,
} from "@warden/core";
import { z } from "zod";

/**
 * x402 challenge schema. The wire format is still evolving; this captures the
 * fields Warden needs to enforce policy. Fields not used for policy are
 * preserved verbatim under `raw` so they can be echoed back in the proof.
 */
const PaymentRequirementSchema = z.object({
  scheme: z.string().default("exact"),
  network: z.string(),
  asset: z.string(),
  payTo: z.string(),
  maxAmountRequired: z.string().optional(),
  amount: z.string().optional(),
  resource: z.string().optional(),
  description: z.string().optional(),
  mimeType: z.string().optional(),
  maxTimeoutSeconds: z.number().optional(),
  outputSchema: z.unknown().optional(),
  extra: z.record(z.string(), z.unknown()).optional(),
});

const ChallengeBodySchema = z.object({
  x402Version: z.number().optional(),
  accepts: z.array(PaymentRequirementSchema).min(1),
  error: z.string().optional(),
  extensions: z.record(z.string(), z.unknown()).optional(),
});

export type RawPaymentRequirement = z.infer<typeof PaymentRequirementSchema>;

export interface ParsedChallenge {
  /** The selected payment requirement Warden will pay against. */
  requirement: ChallengeRequirement;
  /** Original raw block, preserved for the proof. */
  raw: RawPaymentRequirement;
  /** x402 envelope protocol version. */
  x402Version: number;
  /** Sha256 hex of the canonical challenge bytes; stored on the receipt. */
  hash: string;
  /** Optional sign-in-with-x extension from the payment-required envelope. */
  siwx?: unknown;
}

export interface ParseChallengeOptions {
  allowedNetworks?: ChallengeRequirement["network"][];
  allowedTokens?: ChallengeRequirement["token"][];
}

const CELO_USDC_CONTRACT = "0xceba9300f2b948710d2653dd7b07f33a8b32118c";
const CELO_SEPOLIA_USDC_CONTRACT =
  "0x01c5c0122039549ad1493b8220cabedd739bc44e";

function classifyNetwork(network: string): ChallengeRequirement["network"] {
  if (network === CELO_MAINNET_NETWORK || network === "celo-mainnet") {
    return CELO_MAINNET_NETWORK;
  }
  if (network === CELO_SEPOLIA_NETWORK || network === "celo-sepolia") {
    return CELO_SEPOLIA_NETWORK;
  }
  throw new WardenError("challenge_unsupported", `Unsupported x402 network: ${network}`, {
    network,
  });
}

function classifyToken(asset: string): "USDC" {
  const normalized = asset.toLowerCase();
  if (
    normalized === CELO_USDC_CONTRACT ||
    normalized === CELO_SEPOLIA_USDC_CONTRACT ||
    asset.toUpperCase() === "USDC"
  ) {
    return "USDC";
  }
  throw new WardenError(
    "challenge_unsupported",
    `Unrecognized token asset: ${asset}`,
    { asset },
  );
}

function rawToUsd(amountRaw: string): number {
  return Number(amountRaw) / 1_000_000;
}

function requirementAmountRaw(requirement: RawPaymentRequirement): string {
  const amount = requirement.maxAmountRequired ?? requirement.amount;
  if (!amount) {
    throw new WardenError("challenge_invalid", "x402 challenge is missing an amount", {
      requirement,
    });
  }
  return amount;
}

export function parseChallenge(
  body: unknown,
  opts: ParseChallengeOptions = {},
  headers: Record<string, string> = {},
): ParsedChallenge {
  const envelope = selectChallengeEnvelope(body, headers);
  const parsed = ChallengeBodySchema.safeParse(envelope.body);
  if (!parsed.success) {
    throw new WardenError(
      "challenge_invalid",
      "Could not parse x402 payment challenge",
      { issues: parsed.error.issues },
    );
  }

  const candidates = parsed.data.accepts.flatMap((requirement) => {
    try {
      return [
        {
          requirement,
          network: classifyNetwork(requirement.network),
          token: classifyToken(requirement.asset),
          amountRaw: requirementAmountRaw(requirement),
        },
      ];
    } catch {
      return [];
    }
  });
  if (candidates.length === 0) {
    throw new WardenError(
      "challenge_unsupported",
      "No supported x402 payment requirements found",
      { accepts: parsed.data.accepts },
    );
  }
  const compatible = candidates.filter(
    ({ network, token }) =>
      (!opts.allowedNetworks?.length ||
        opts.allowedNetworks.includes(network)) &&
      (!opts.allowedTokens?.length || opts.allowedTokens.includes(token)),
  );
  const selected = compatible[0] ?? candidates[0]!;
  const { requirement, network, token, amountRaw } = selected;
  const amountUsd = rawToUsd(amountRaw);

  const canonical = JSON.stringify(requirement);
  const hash = createHash("sha256").update(canonical).digest("hex");

  return {
    requirement: {
      network,
      token,
      recipient: requirement.payTo,
      amountRaw,
      amountUsd,
      nonce: hash,
      ...(requirement.extra && typeof requirement.extra["facilitator"] === "string"
        ? { facilitator: requirement.extra["facilitator"] as string }
        : {}),
    },
    raw: requirement,
    x402Version: envelope.x402Version ?? parsed.data.x402Version ?? 2,
    hash,
    ...(parsed.data.extensions?.["sign-in-with-x"] !== undefined
      ? { siwx: parsed.data.extensions["sign-in-with-x"] }
      : {}),
  };
}

function selectChallengeEnvelope(
  body: unknown,
  headers: Record<string, string>,
): { body: unknown; x402Version?: number } {
  const paymentRequired = headerValue(headers, "payment-required");
  if (paymentRequired) {
    const decoded = decodeBase64Json(paymentRequired);
    if (decoded !== undefined) {
      return { body: decoded, x402Version: 2 };
    }
  }

  const v1PaymentRequired = headerValue(headers, "x-payment-required");
  if (v1PaymentRequired) {
    const decoded = decodeBase64Json(v1PaymentRequired);
    if (decoded !== undefined) {
      return { body: decoded, x402Version: 1 };
    }
  }

  return { body: coerceJsonBody(body) };
}

function headerValue(
  headers: Record<string, string>,
  name: string,
): string | undefined {
  const direct = headers[name] ?? headers[name.toLowerCase()];
  if (direct !== undefined) return direct;
  const found = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  );
  return found?.[1];
}

function decodeBase64Json(value: string): unknown {
  try {
    return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
  } catch {
    return undefined;
  }
}

function coerceJsonBody(body: unknown): unknown {
  if (typeof body !== "string") return body;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

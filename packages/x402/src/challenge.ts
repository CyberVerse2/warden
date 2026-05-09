import { createHash } from "node:crypto";
import { WardenError, type ChallengeRequirement } from "@warden/core";
import { z } from "zod";

/**
 * x402 challenge schema. The wire format is still evolving; this captures the
 * fields Warden needs to enforce policy. Fields not used for policy are
 * preserved verbatim under `raw` so they can be echoed back in the proof.
 */
const PaymentRequirementSchema = z.object({
  scheme: z.string().default("exact"),
  network: z.enum(["solana-mainnet", "solana-devnet"]),
  asset: z.string(),
  payTo: z.string(),
  maxAmountRequired: z.string(),
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
});

export type RawPaymentRequirement = z.infer<typeof PaymentRequirementSchema>;

export interface ParsedChallenge {
  /** The selected payment requirement Warden will pay against. */
  requirement: ChallengeRequirement;
  /** Original raw block, preserved for the proof. */
  raw: RawPaymentRequirement;
  /** Sha256 hex of the canonical challenge bytes; stored on the receipt. */
  hash: string;
}

const USDC_DEVNET_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const USDC_MAINNET_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function classifyToken(asset: string): "USDC" | "SOL" {
  if (asset === USDC_DEVNET_MINT || asset === USDC_MAINNET_MINT || asset.toUpperCase() === "USDC") {
    return "USDC";
  }
  if (asset === "SOL" || asset === "11111111111111111111111111111111") {
    return "SOL";
  }
  // Unknown SPL mint — we treat as unsupported until policy explicitly opts in.
  throw new WardenError(
    "challenge_unsupported",
    `Unrecognised token asset: ${asset}`,
    { asset },
  );
}

function rawToUsd(amountRaw: string, token: "USDC" | "SOL"): number {
  if (token === "USDC") return Number(amountRaw) / 1_000_000;
  // SOL conversion would call an oracle. For MVP we deny SOL-priced challenges
  // unless explicitly allowed; surface raw lamports as a placeholder USD value.
  return Number(amountRaw) / 1_000_000_000;
}

export function parseChallenge(body: unknown): ParsedChallenge {
  const parsed = ChallengeBodySchema.safeParse(body);
  if (!parsed.success) {
    throw new WardenError(
      "challenge_invalid",
      "Could not parse x402 payment challenge",
      { issues: parsed.error.issues },
    );
  }

  const requirement = parsed.data.accepts[0]!;
  const token = classifyToken(requirement.asset);
  const amountUsd = rawToUsd(requirement.maxAmountRequired, token);

  const canonical = JSON.stringify(requirement);
  const hash = createHash("sha256").update(canonical).digest("hex");

  return {
    requirement: {
      network: requirement.network,
      token,
      recipient: requirement.payTo,
      amountRaw: requirement.maxAmountRequired,
      amountUsd,
      nonce: hash,
      ...(requirement.extra && typeof requirement.extra["facilitator"] === "string"
        ? { facilitator: requirement.extra["facilitator"] as string }
        : {}),
    },
    raw: requirement,
    hash,
  };
}

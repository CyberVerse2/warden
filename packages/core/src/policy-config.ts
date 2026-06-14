import { z } from "zod";
import { CELO_MAINNET_NETWORK, CELO_SEPOLIA_NETWORK } from "./types";

export const SupportedNetworkSchema = z.enum([
  CELO_MAINNET_NETWORK,
  CELO_SEPOLIA_NETWORK,
]);

export const PolicyConfigSchema = z.object({
  mode: z.enum(["managed", "advanced"]).default("advanced"),
  riskPosture: z
    .enum(["conservative", "balanced", "aggressive"])
    .default("balanced"),
  purpose: z.string().optional(),
  allowedHosts: z.array(z.string().min(1)).default([]),
  allowedNetworks: z.array(SupportedNetworkSchema).default([CELO_SEPOLIA_NETWORK]),
  allowedTokens: z.array(z.enum(["USDC"])).default(["USDC"]),
  allowedMethods: z
    .array(z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]))
    .default(["GET", "POST"]),
  maxUsdPerRequest: z.number().nonnegative().default(0),
  maxUsdPerDay: z.number().nonnegative().default(0),
  /** Above this amount, an approval is required even if all other checks pass. */
  approvalThresholdUsd: z.number().nonnegative().optional(),
});

export type PolicyConfig = z.infer<typeof PolicyConfigSchema>;

export const DEFAULT_POLICY: PolicyConfig = {
  mode: "managed",
  riskPosture: "balanced",
  purpose: "General x402 agent spend",
  allowedHosts: [],
  allowedNetworks: [CELO_SEPOLIA_NETWORK],
  allowedTokens: ["USDC"],
  allowedMethods: ["GET", "POST"],
  maxUsdPerRequest: 1,
  maxUsdPerDay: 5,
};

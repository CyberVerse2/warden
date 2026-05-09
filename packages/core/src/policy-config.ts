import { z } from "zod";

export const PolicyConfigSchema = z.object({
  allowedHosts: z.array(z.string().min(1)).default([]),
  allowedNetworks: z
    .array(z.enum(["solana-mainnet", "solana-devnet"]))
    .default(["solana-devnet"]),
  allowedTokens: z.array(z.enum(["USDC", "SOL"])).default(["USDC"]),
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
  allowedHosts: [],
  allowedNetworks: ["solana-devnet"],
  allowedTokens: ["USDC"],
  allowedMethods: ["GET", "POST"],
  maxUsdPerRequest: 0,
  maxUsdPerDay: 0,
};

import {
  CELO_MAINNET_NETWORK,
  CELO_SEPOLIA_NETWORK,
  newId,
  PolicyConfigSchema,
} from "@warden/core";
import { agentTokens, agents, policies } from "@warden/db";
import { hashToken } from "@warden/runtime";
import { createWalletService } from "@warden/wallet";
import { getCurrentUser } from "~/lib/auth";
import { getDb } from "~/lib/db";
import { requireEnv } from "~/lib/env";

export type CreatedAgent = {
  agentId: string;
  rawToken: string;
};

export function formString(formData: FormData, key: string, fallback = "") {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function requiredFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} is required`);
  }
  return value.trim();
}

export function formNetwork(formData: FormData) {
  const value = requiredFormString(formData, "network");
  if (value !== CELO_MAINNET_NETWORK && value !== CELO_SEPOLIA_NETWORK) {
    throw new Error(
      `network must be ${CELO_MAINNET_NETWORK} or ${CELO_SEPOLIA_NETWORK}`,
    );
  }
  return value;
}

export function formNumber(formData: FormData, key: string, fallback: number) {
  const value = formString(formData, key);
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${key} must be a non-negative number`);
  }
  return parsed;
}

export function formRiskPosture(formData: FormData) {
  const value = formString(formData, "riskPosture", "balanced");
  if (
    value !== "conservative" &&
    value !== "balanced" &&
    value !== "aggressive"
  ) {
    throw new Error("riskPosture must be conservative, balanced, or aggressive");
  }
  return value;
}

function requestCapForBudget(dailyBudgetUsd: number, posture: string) {
  if (dailyBudgetUsd <= 0) return 0;
  const ratio =
    posture === "conservative" ? 0.1 : posture === "aggressive" ? 0.5 : 0.25;
  return Number(Math.max(0.01, dailyBudgetUsd * ratio).toFixed(6));
}

export function managedPolicyFromForm(formData: FormData) {
  const dailyBudgetUsd = formNumber(formData, "dailyBudgetUsd", 5);
  const riskPosture = formRiskPosture(formData);
  return PolicyConfigSchema.parse({
    mode: "managed",
    riskPosture,
    purpose: formString(formData, "purpose", "General x402 agent spend"),
    allowedHosts: [],
    allowedNetworks: [formNetwork(formData)],
    allowedTokens: ["USDC"],
    allowedMethods: ["GET", "POST"],
    maxUsdPerRequest: requestCapForBudget(dailyBudgetUsd, riskPosture),
    maxUsdPerDay: dailyBudgetUsd,
  });
}

export async function createAgentRecord(
  formData: FormData,
): Promise<CreatedAgent> {
  const db = getDb();
  const currentUser = await getCurrentUser();
  const agentId = newId.agent();
  const rawToken = newId.token();
  const walletService = createWalletService({
    db,
    rpcUrl: requireEnv("CELO_RPC_URL"),
    rpcUrls: {
      mainnet: process.env.CELO_MAINNET_RPC_URL,
      sepolia: process.env.CELO_SEPOLIA_RPC_URL,
    },
  });

  await db.insert(agents).values({
    id: agentId,
    userId: currentUser.id,
    name: requiredFormString(formData, "name"),
    status: "active",
  });
  await walletService.createWallet({
    agentId,
    network: formNetwork(formData),
  });
  await db.insert(policies).values({
    id: newId.policy(),
    agentId,
    version: 1,
    config: managedPolicyFromForm(formData),
    activatedAt: new Date(),
  });
  await db.insert(agentTokens).values({
    id: newId.token(),
    agentId,
    tokenHash: hashToken(rawToken),
    label: "default",
  });

  return { agentId, rawToken };
}

"use server";

import { DEFAULT_POLICY, newId, PolicyConfigSchema } from "@warden/core";
import { agentTokens, agents, policies, wallets } from "@warden/db";
import { hashToken } from "@warden/runtime";
import { createWalletService } from "@warden/wallet";
import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "~/lib/auth";
import { getDb } from "~/lib/db";
import { requireEnv } from "~/lib/env";

function formString(formData: FormData, key: string, fallback = "") {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function requiredFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} is required`);
  }
  return value.trim();
}

function formNetwork(formData: FormData) {
  const value = requiredFormString(formData, "network");
  if (value !== "solana-mainnet" && value !== "solana-devnet") {
    throw new Error("network must be solana-mainnet or solana-devnet");
  }
  return value;
}

export async function createAgent(formData: FormData) {
  const db = getDb();
  const currentUser = await getCurrentUser();
  const agentId = newId.agent();
  const rawToken = newId.token();
  const walletService = createWalletService({
    db,
    rpcUrl: requireEnv("SOLANA_RPC_URL"),
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
    config: DEFAULT_POLICY,
    activatedAt: new Date(),
  });
  await db.insert(agentTokens).values({
    id: newId.token(),
    agentId,
    tokenHash: hashToken(rawToken),
    label: "default",
  });

  revalidatePath("/agents");
  redirect(`/agents/${agentId}/token?token=${encodeURIComponent(rawToken)}`);
}

export async function updatePolicy(agentId: string, formData: FormData) {
  const db = getDb();
  const currentUser = await getCurrentUser();
  const [agent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.userId, currentUser.id)));
  if (!agent) return;

  const config = PolicyConfigSchema.parse({
    allowedHosts: formString(formData, "allowedHosts")
      .split(/\s*,\s*/)
      .map((h) => h.trim())
      .filter(Boolean),
    allowedNetworks: formData.getAll("allowedNetworks"),
    allowedTokens: formData.getAll("allowedTokens"),
    allowedMethods: formData.getAll("allowedMethods"),
    maxUsdPerRequest: Number(formData.get("maxUsdPerRequest") ?? 0),
    maxUsdPerDay: Number(formData.get("maxUsdPerDay") ?? 0),
    approvalThresholdUsd:
      formString(formData, "approvalThresholdUsd") === ""
        ? undefined
        : Number(formData.get("approvalThresholdUsd")),
  });

  const [latest] = await db
    .select({ version: policies.version })
    .from(policies)
    .where(eq(policies.agentId, agentId))
    .orderBy(desc(policies.version))
    .limit(1);

  await db.insert(policies).values({
    id: newId.policy(),
    agentId,
    version: (latest?.version ?? 0) + 1,
    config,
    activatedAt: new Date(),
  });

  revalidatePath(`/agents/${agentId}`);
  revalidatePath("/agents");
}

export async function revokeAgent(agentId: string) {
  const db = getDb();
  const currentUser = await getCurrentUser();
  const [agent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.userId, currentUser.id)));
  if (!agent) return;

  await db.update(agents).set({ status: "revoked" }).where(eq(agents.id, agentId));
  await db.update(wallets).set({ status: "revoked" }).where(eq(wallets.agentId, agentId));
  await db
    .update(agentTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(agentTokens.agentId, agentId)));

  revalidatePath(`/agents/${agentId}`);
  revalidatePath("/agents");
}

export async function rotateAgentToken(agentId: string) {
  const db = getDb();
  const currentUser = await getCurrentUser();
  const [agent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.userId, currentUser.id)));
  if (!agent) return;

  const rawToken = newId.token();
  await db
    .update(agentTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(agentTokens.agentId, agentId)));
  await db.insert(agentTokens).values({
    id: newId.token(),
    agentId,
    tokenHash: hashToken(rawToken),
    label: "rotated",
  });

  revalidatePath(`/agents/${agentId}`);
  redirect(`/agents/${agentId}/token?token=${encodeURIComponent(rawToken)}`);
}

export async function airdropDevnetSol(agentId: string) {
  const db = getDb();
  const currentUser = await getCurrentUser();
  const [row] = await db
    .select({ publicKey: wallets.publicKey, network: wallets.network })
    .from(agents)
    .innerJoin(wallets, eq(wallets.agentId, agents.id))
    .where(and(eq(agents.id, agentId), eq(agents.userId, currentUser.id)));
  if (!row || row.network !== "solana-devnet") return;

  const { Connection, LAMPORTS_PER_SOL, PublicKey } = await import("@solana/web3.js");
  const connection = new Connection(
    requireEnv("SOLANA_RPC_URL"),
    "confirmed",
  );
  await connection.requestAirdrop(new PublicKey(row.publicKey), 2 * LAMPORTS_PER_SOL);
  revalidatePath(`/agents/${agentId}`);
  revalidatePath("/agents");
}

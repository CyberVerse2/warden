"use server";

import { newId, PolicyConfigSchema } from "@warden/core";
import { agentTokens, agents, policies, wallets } from "@warden/db";
import { hashToken } from "@warden/runtime";
import { createWalletService } from "@warden/wallet";
import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "~/lib/auth";
import { getDb } from "~/lib/db";
import { requireEnv } from "~/lib/env";
import {
  formNetwork,
  formNumber,
  formRiskPosture,
  formString,
  managedPolicyFromForm,
} from "./mutations";

function uniqueHosts(values: string[]) {
  return [...new Set(values.map((h) => h.trim()).filter(Boolean))];
}

export async function updatePolicy(agentId: string, formData: FormData) {
  const db = getDb();
  const currentUser = await getCurrentUser();
  const [agent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.userId, currentUser.id)));
  if (!agent) return;

  const mode = formString(formData, "policyMode", "managed");
  const config =
    mode === "managed"
      ? managedPolicyFromForm(formData)
      : PolicyConfigSchema.parse({
          mode: "advanced",
          riskPosture: formRiskPosture(formData),
          purpose: formString(formData, "purpose", "Advanced x402 policy"),
          allowedHosts: uniqueHosts([
            ...formData
              .getAll("allowedHosts")
              .filter((h): h is string => typeof h === "string"),
            ...formString(formData, "customAllowedHosts")
              .split(/\s*,\s*/)
              .map((h) => h.trim()),
          ]),
          allowedNetworks: formData.getAll("allowedNetworks"),
          allowedTokens: formData.getAll("allowedTokens"),
          allowedMethods: formData.getAll("allowedMethods"),
          maxUsdPerRequest: formNumber(formData, "maxUsdPerRequest", 0),
          maxUsdPerDay: formNumber(formData, "maxUsdPerDay", 0),
          approvalThresholdUsd:
            formString(formData, "approvalThresholdUsd") === ""
              ? undefined
              : formNumber(formData, "approvalThresholdUsd", 0),
        });

  const [latest] = await db
    .select({ version: policies.version })
    .from(policies)
    .where(eq(policies.agentId, agentId))
    .orderBy(desc(policies.version))
    .limit(1);

  await db
    .update(policies)
    .set({ activatedAt: null })
    .where(eq(policies.agentId, agentId));

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

export async function switchAgentNetwork(agentId: string, formData: FormData) {
  const db = getDb();
  const currentUser = await getCurrentUser();
  const targetNetwork = formNetwork(formData);
  const [agent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.userId, currentUser.id)));
  if (!agent) return;

  const [currentWallet] = await db
    .select({ id: wallets.id, network: wallets.network })
    .from(wallets)
    .where(and(eq(wallets.agentId, agentId), eq(wallets.status, "active")))
    .limit(1);
  if (currentWallet?.network === targetNetwork) return;

  const walletService = createWalletService({
    db,
    rpcUrl: requireEnv("CELO_RPC_URL"),
    rpcUrls: {
      mainnet: process.env.CELO_MAINNET_RPC_URL,
      sepolia: process.env.CELO_SEPOLIA_RPC_URL,
    },
  });
  if (currentWallet) {
    await db
      .update(wallets)
      .set({ network: targetNetwork })
      .where(eq(wallets.id, currentWallet.id));
  } else {
    await walletService.createWallet({
      agentId,
      network: targetNetwork,
    });
  }

  const [latest] = await db
    .select({ version: policies.version, config: policies.config })
    .from(policies)
    .where(eq(policies.agentId, agentId))
    .orderBy(desc(policies.version))
    .limit(1);
  const currentPolicy = PolicyConfigSchema.parse(latest?.config ?? {});
  await db
    .update(policies)
    .set({ activatedAt: null })
    .where(eq(policies.agentId, agentId));

  await db.insert(policies).values({
    id: newId.policy(),
    agentId,
    version: (latest?.version ?? 0) + 1,
    config: {
      ...currentPolicy,
      allowedNetworks: [targetNetwork],
    },
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

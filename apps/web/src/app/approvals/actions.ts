"use server";

import { agents, approvals } from "@warden/db";
import { createRuntime } from "@warden/runtime";
import { createWalletService } from "@warden/wallet";
import { createX402EvmProofBuilder } from "@warden/x402/proof";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "~/lib/auth";
import { getDb } from "~/lib/db";
import { requireEnv } from "~/lib/env";

export async function decideApproval(
  approvalId: string,
  decision: "approved" | "denied",
) {
  const db = getDb();
  const currentUser = await getCurrentUser();
  const [approval] = await db
    .select({
      id: approvals.id,
      agentId: approvals.agentId,
      requestSnapshot: approvals.requestSnapshot,
      status: approvals.status,
    })
    .from(approvals)
    .innerJoin(agents, eq(agents.id, approvals.agentId))
    .where(and(eq(approvals.id, approvalId), eq(agents.userId, currentUser.id)))
    .limit(1);
  if (!approval || approval.status !== "pending") return;

  await db
    .update(approvals)
    .set({
      status: decision,
      decidedAt: new Date(),
      decidedBy: currentUser.id,
    })
    .where(eq(approvals.id, approvalId));

  if (decision === "approved") {
    const rpcUrl = requireEnv("CELO_RPC_URL");
    const walletService = createWalletService({
      db,
      rpcUrl,
      rpcUrls: {
        mainnet: process.env.CELO_MAINNET_RPC_URL,
        sepolia: process.env.CELO_SEPOLIA_RPC_URL ?? rpcUrl,
      },
    });
    const proofBuilder = createX402EvmProofBuilder(walletService, {
      rpcUrl,
      rpcUrls: {
        mainnet: process.env.CELO_MAINNET_RPC_URL,
        sepolia: process.env.CELO_SEPOLIA_RPC_URL ?? rpcUrl,
      },
    });
    const runtime = createRuntime({ db, walletService, proofBuilder });
    const snapshot = approval.requestSnapshot as {
      request?: Parameters<typeof runtime.executePaidRequest>[0]["request"];
      taskId?: string;
    };
    if (snapshot.request) {
      await runtime.executePaidRequest({
        agentId: approval.agentId,
        request: snapshot.request,
        ...(snapshot.taskId ? { taskId: snapshot.taskId } : {}),
        skipPolicy: { reason: "human_override.approved" },
      });
    }
  }

  revalidatePath("/approvals");
  revalidatePath("/");
}

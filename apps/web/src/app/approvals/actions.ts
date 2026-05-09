"use server";

import { agents, approvals } from "@warden/db";
import { createRuntime } from "@warden/runtime";
import { createWalletService } from "@warden/wallet";
import { createCoinbaseSolanaProofBuilder } from "@warden/x402";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "~/lib/auth";
import { getDb } from "~/lib/db";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

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
    const rpcUrl = requireEnv("SOLANA_RPC_URL");
    const facilitatorUrl = requireEnv("COINBASE_X402_FACILITATOR_URL");
    const walletService = createWalletService({ db, rpcUrl });
    const proofBuilder = createCoinbaseSolanaProofBuilder(walletService, {
      rpcUrl,
      facilitatorUrl,
      cdpApiKeyId: process.env.CDP_API_KEY_ID,
      cdpApiKeySecret: process.env.CDP_API_KEY_SECRET,
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

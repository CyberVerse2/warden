import { createHash } from "node:crypto";
import { WardenError } from "@warden/core";
import { agentTokens, agents, wallets, type Db } from "@warden/db";
import { and, eq, isNull } from "drizzle-orm";

export interface ResolvedAgent {
  agentId: string;
  walletId: string;
  status: "active" | "revoked";
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function resolveAgentByToken(
  db: Db,
  token: string,
): Promise<ResolvedAgent> {
  const tokenHash = hashToken(token);
  const [row] = await db
    .select({
      agentId: agents.id,
      status: agents.status,
      walletId: wallets.id,
    })
    .from(agentTokens)
    .innerJoin(agents, eq(agentTokens.agentId, agents.id))
    .leftJoin(
      wallets,
      and(eq(wallets.agentId, agents.id), eq(wallets.status, "active")),
    )
    .where(
      and(eq(agentTokens.tokenHash, tokenHash), isNull(agentTokens.revokedAt)),
    )
    .limit(1);

  if (!row) {
    throw new WardenError("unauthorized", "Invalid or revoked agent token");
  }
  if (!row.walletId) {
    throw new WardenError(
      "wallet_not_found",
      "Agent has no active wallet",
      { agentId: row.agentId },
    );
  }

  return {
    agentId: row.agentId,
    walletId: row.walletId,
    status: row.status,
  };
}

export async function resolveAgentById(
  db: Db,
  agentId: string,
): Promise<ResolvedAgent> {
  const [row] = await db
    .select({
      agentId: agents.id,
      status: agents.status,
      walletId: wallets.id,
    })
    .from(agents)
    .leftJoin(
      wallets,
      and(eq(wallets.agentId, agents.id), eq(wallets.status, "active")),
    )
    .where(eq(agents.id, agentId))
    .limit(1);

  if (!row) {
    throw new WardenError("unauthorized", "Agent not found");
  }
  if (!row.walletId) {
    throw new WardenError(
      "wallet_not_found",
      "Agent has no active wallet",
      { agentId: row.agentId },
    );
  }

  return {
    agentId: row.agentId,
    walletId: row.walletId,
    status: row.status,
  };
}

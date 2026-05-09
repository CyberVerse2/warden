/**
 * Seeds a working Warden database for local dev.
 *
 * Creates one operator + four agents that mirror the fixtures used by the web
 * app, plus their wallets, API tokens, active policies, recent receipts, and a
 * couple of pending approvals.
 *
 * Run with: pnpm --filter @warden/mcp seed
 */
import { createHash } from "node:crypto";
import { createDb, agents, agentTokens, policies, receipts, approvals, users, wallets, spendWindows } from "@warden/db";
import { loadServerEnv, newId, type PolicyConfig } from "@warden/core";
import { createWalletService } from "@warden/wallet";
import { sql } from "drizzle-orm";

const NOW = Date.now();
const m = (mins: number) => new Date(NOW - mins * 60_000);

interface SeedAgentInput {
  name: string;
  network: "solana-mainnet" | "solana-devnet";
  policy: PolicyConfig;
  spentTodayUsd: number;
}

const AGENTS: SeedAgentInput[] = [
  {
    name: "research-agent",
    network: "solana-devnet",
    spentTodayUsd: 0.42,
    policy: {
      allowedHosts: ["x402.quicknode.com", "api.helius.xyz"],
      allowedNetworks: ["solana-devnet"],
      allowedTokens: ["USDC"],
      allowedMethods: ["GET", "POST"],
      maxUsdPerRequest: 0.05,
      maxUsdPerDay: 2.0,
    },
  },
  {
    name: "data-pipeline",
    network: "solana-devnet",
    spentTodayUsd: 3.18,
    policy: {
      allowedHosts: ["api.bigquery.com", "api.helius.xyz"],
      allowedNetworks: ["solana-devnet"],
      allowedTokens: ["USDC"],
      allowedMethods: ["GET", "POST"],
      maxUsdPerRequest: 0.5,
      maxUsdPerDay: 5.0,
      approvalThresholdUsd: 1.5,
    },
  },
  {
    name: "market-watch",
    network: "solana-mainnet",
    spentTodayUsd: 1.62,
    policy: {
      allowedHosts: ["api.coingecko.com", "x402.quicknode.com"],
      allowedNetworks: ["solana-mainnet"],
      allowedTokens: ["USDC"],
      allowedMethods: ["GET", "POST"],
      maxUsdPerRequest: 0.25,
      maxUsdPerDay: 10.0,
    },
  },
  {
    name: "legacy-fetch",
    network: "solana-devnet",
    spentTodayUsd: 0,
    policy: {
      allowedHosts: [],
      allowedNetworks: ["solana-devnet"],
      allowedTokens: ["USDC"],
      allowedMethods: ["GET"],
      maxUsdPerRequest: 0,
      maxUsdPerDay: 0,
    },
  },
];

async function main() {
  loadServerEnv();

  if (!process.env.WARDEN_MASTER_KEY) {
    throw new Error("WARDEN_MASTER_KEY env var is required");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL env var is required");
  }
  if (!process.env.SOLANA_RPC_URL) {
    throw new Error("SOLANA_RPC_URL env var is required");
  }
  if (!process.env.DEV_OPERATOR_USER_ID || !process.env.DEV_OPERATOR_EMAIL) {
    throw new Error("DEV_OPERATOR_USER_ID and DEV_OPERATOR_EMAIL env vars are required");
  }
  const db = createDb(process.env.DATABASE_URL);
  const walletService = createWalletService({
    db,
    rpcUrl: process.env.SOLANA_RPC_URL,
  });

  console.log("→ wiping existing data");
  await db.execute(sql`DELETE FROM receipts`);
  await db.execute(sql`DELETE FROM approvals`);
  await db.execute(sql`DELETE FROM spend_windows`);
  await db.execute(sql`DELETE FROM agent_tokens`);
  await db.execute(sql`DELETE FROM policies`);
  await db.execute(sql`DELETE FROM wallets`);
  await db.execute(sql`DELETE FROM agents`);
  await db.execute(sql`DELETE FROM users`);

  const userId = process.env.DEV_OPERATOR_USER_ID;
  const email = process.env.DEV_OPERATOR_EMAIL;
  await db.insert(users).values({
    id: userId,
    email,
    name: "Local operator",
  });
  console.log(`→ user ${userId} (${email})`);

  const created: Array<{ id: string; name: string; walletId: string; token: string }> = [];

  for (const a of AGENTS) {
    const agentId = newId.agent();
    await db.insert(agents).values({
      id: agentId,
      userId,
      name: a.name,
      status: a.name === "legacy-fetch" ? "revoked" : "active",
    });

    const { walletId } = await walletService.createWallet({
      agentId,
      network: a.network,
    });

    const token = `wt_${newId.token()}`;
    await db.insert(agentTokens).values({
      id: newId.token(),
      agentId,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      label: "primary",
    });

    const policyId = newId.policy();
    await db.insert(policies).values({
      id: policyId,
      agentId,
      version: 1,
      config: a.policy,
      activatedAt: new Date(),
    });

    if (a.spentTodayUsd > 0) {
      const utc = new Date();
      const key = `day:${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, "0")}-${String(utc.getUTCDate()).padStart(2, "0")}`;
      await db.insert(spendWindows).values({
        agentId,
        windowKey: key,
        amountUsd: a.spentTodayUsd,
      });
    }

    created.push({ id: agentId, name: a.name, walletId, token });
    console.log(`  · ${a.name.padEnd(16)} ${agentId} · token=${token}`);
  }

  // Receipts — mirror the demo activity so the UI lights up.
  const research = created.find((c) => c.name === "research-agent")!;
  const dataPipeline = created.find((c) => c.name === "data-pipeline")!;
  const market = created.find((c) => c.name === "market-watch")!;

  type R = typeof receipts.$inferInsert;
  const sample: R[] = [
    {
      id: newId.receipt(), agentId: market.id, walletId: market.walletId,
      url: "https://x402.quicknode.com/solana-mainnet", method: "POST",
      host: "x402.quicknode.com", provider: "QuickNode",
      amountRaw: "50000", amountUsd: 0.05, currency: "USDC",
      network: "solana-mainnet", recipient: "facilitator",
      challengeHash: "c1", requestHash: "r1", responseStatus: 200,
      txSignature: "5pXaQzRm4fDgKj8nLb2VtY", decision: "allow",
      decisionReason: "policy.allow", createdAt: m(0.5),
    },
    {
      id: newId.receipt(), agentId: research.id, walletId: research.walletId,
      url: "https://api.helius.xyz/v0/transactions", method: "GET",
      host: "api.helius.xyz", provider: "Helius",
      amountRaw: "12500", amountUsd: 0.0125, currency: "USDC",
      network: "solana-devnet", recipient: "facilitator",
      challengeHash: "c2", requestHash: "r2", responseStatus: 200,
      txSignature: "3kLmZxQp7rNc2JeBtV4hG", decision: "allow",
      decisionReason: "policy.allow", createdAt: m(2),
    },
    {
      id: newId.receipt(), agentId: research.id, walletId: research.walletId,
      url: "https://api.suspicious-provider.com/feed", method: "GET",
      host: "api.suspicious-provider.com", provider: "unknown",
      amountRaw: "8000000", amountUsd: 8.0, currency: "USDC",
      network: "solana-devnet", recipient: "facilitator",
      challengeHash: "c3", requestHash: "r3", responseStatus: 402,
      decision: "deny",
      decisionReason: "policy.allowedHosts: Host not in allowlist",
      createdAt: m(4),
    },
    {
      id: newId.receipt(), agentId: dataPipeline.id, walletId: dataPipeline.walletId,
      url: "https://api.bigquery.com/v2/queries", method: "POST",
      host: "api.bigquery.com", provider: "BigQuery",
      amountRaw: "420000", amountUsd: 0.42, currency: "USDC",
      network: "solana-devnet", recipient: "facilitator",
      challengeHash: "c4", requestHash: "r4", responseStatus: 200,
      txSignature: "8tRpYwJk5mQc3FzAhB6vL", decision: "allow",
      decisionReason: "policy.allow", createdAt: m(7),
    },
    {
      id: newId.receipt(), agentId: dataPipeline.id, walletId: dataPipeline.walletId,
      url: "https://api.bigquery.com/v2/queries", method: "POST",
      host: "api.bigquery.com", provider: "BigQuery",
      amountRaw: "2500000", amountUsd: 2.5, currency: "USDC",
      network: "solana-devnet", recipient: "facilitator",
      challengeHash: "c5", requestHash: "r5", responseStatus: 402,
      decision: "deny",
      decisionReason: "policy.maxUsdPerRequest: $2.5000 exceeds per-request cap of $0.50",
      createdAt: m(13),
    },
    {
      id: newId.receipt(), agentId: market.id, walletId: market.walletId,
      url: "https://api.coingecko.com/api/v3/simple/price", method: "GET",
      host: "api.coingecko.com", provider: "CoinGecko",
      amountRaw: "1000", amountUsd: 0.001, currency: "USDC",
      network: "solana-mainnet", recipient: "facilitator",
      challengeHash: "c6", requestHash: "r6", responseStatus: 200,
      txSignature: "2kMnQpRzL4fJh8AxBcTvE", decision: "allow",
      decisionReason: "policy.allow", createdAt: m(18),
    },
    {
      id: newId.receipt(), agentId: research.id, walletId: research.walletId,
      url: "https://api.helius.xyz/v0/addresses", method: "GET",
      host: "api.helius.xyz", provider: "Helius",
      amountRaw: "25000", amountUsd: 0.025, currency: "USDC",
      network: "solana-devnet", recipient: "facilitator",
      challengeHash: "c7", requestHash: "r7", responseStatus: 503,
      txSignature: "9wXcVnMqPrK4tBhZeJaFu", decision: "failed",
      decisionReason: "payment_failed:503", createdAt: m(24),
    },
    {
      id: newId.receipt(), agentId: dataPipeline.id, walletId: dataPipeline.walletId,
      url: "https://api.helius.xyz/v0/addresses", method: "GET",
      host: "api.helius.xyz", provider: "Helius",
      amountRaw: "25000", amountUsd: 0.025, currency: "USDC",
      network: "solana-devnet", recipient: "facilitator",
      challengeHash: "c8", requestHash: "r8", responseStatus: 200,
      txSignature: "6jVbXcPnQ3rK9tFzWeMaE", decision: "allow",
      decisionReason: "policy.allow", createdAt: m(31),
    },
    {
      id: newId.receipt(), agentId: market.id, walletId: market.walletId,
      url: "https://x402.quicknode.com/solana-mainnet", method: "POST",
      host: "x402.quicknode.com", provider: "QuickNode",
      amountRaw: "50000", amountUsd: 0.05, currency: "USDC",
      network: "solana-mainnet", recipient: "facilitator",
      challengeHash: "c9", requestHash: "r9", responseStatus: 200,
      txSignature: "4nYxQpCmLk2VrJ8HbTeGa", decision: "allow",
      decisionReason: "policy.allow", createdAt: m(42),
    },
    {
      id: newId.receipt(), agentId: research.id, walletId: research.walletId,
      url: "https://x402.quicknode.com/solana-devnet", method: "POST",
      host: "x402.quicknode.com", provider: "QuickNode",
      amountRaw: "50000", amountUsd: 0.05, currency: "USDC",
      network: "solana-devnet", recipient: "facilitator",
      challengeHash: "c10", requestHash: "r10", responseStatus: 200,
      txSignature: "7sQzKmRvL3fXc1JtBhWeP", decision: "allow",
      decisionReason: "policy.allow", createdAt: m(58),
    },
  ];
  await db.insert(receipts).values(sample);
  console.log(`→ ${sample.length} receipts`);

  await db.insert(approvals).values([
    {
      id: newId.approval(),
      agentId: dataPipeline.id,
      amountUsd: 2.5,
      triggeringRule: "policy.approvalThresholdUsd",
      requestSnapshot: {
        request: { url: "https://api.bigquery.com/v2/queries/large-scan", method: "POST" },
        amountUsd: 2.5,
      },
      status: "pending",
      createdAt: m(3),
    },
    {
      id: newId.approval(),
      agentId: dataPipeline.id,
      amountUsd: 1.8,
      triggeringRule: "policy.approvalThresholdUsd",
      requestSnapshot: {
        request: { url: "https://api.bigquery.com/v2/queries/historical", method: "POST" },
        amountUsd: 1.8,
      },
      status: "pending",
      createdAt: m(11),
    },
  ]);
  console.log("→ 2 approvals pending");

  console.log("\n✓ seed complete");
  console.log("\nAPI tokens (copy one to MCP client config as WARDEN_AGENT_TOKEN):");
  for (const c of created) {
    console.log(`  ${c.name.padEnd(16)} ${c.token}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

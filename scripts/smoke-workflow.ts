import { loadServerEnv, requireEnv } from "@warden/core";
import { agents, and, createDb, desc, eq, receipts, wallets } from "@warden/db";
import { createRuntime, resolveAgentByToken } from "@warden/runtime";
import { createWalletService } from "@warden/wallet";
import { createX402EvmProofBuilder, discoverPayServices } from "@warden/x402";

loadServerEnv();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function log(message: string) {
  console.log(`✓ ${message}`);
}

function arg(name: string) {
  const prefix = `${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found?.slice(prefix.length);
}

function required(name: string, hint?: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required${hint ? `: ${hint}` : ""}`);
  }
  return value;
}

async function resolveSmokeAgent(
  db: ReturnType<typeof createDb>,
  agentToken: string | undefined,
) {
  if (agentToken) {
    const resolved = await resolveAgentByToken(db, agentToken);
    const [agent] = await db
      .select({ id: agents.id, name: agents.name, status: agents.status })
      .from(agents)
      .where(eq(agents.id, resolved.agentId));
    assert(agent, "smoke agent token did not resolve to an agent row");
    return [{
      agent,
      agentId: resolved.agentId,
      walletId: resolved.walletId,
      execution: { agentToken },
      source: "token",
    }];
  }

  const requestedAgentId = process.env.WARDEN_SMOKE_AGENT_ID;
  const rows = await db
    .select({
      agentId: agents.id,
      name: agents.name,
      status: agents.status,
      walletId: wallets.id,
    })
    .from(agents)
    .innerJoin(wallets, eq(wallets.agentId, agents.id))
    .where(
      requestedAgentId
        ? and(
            eq(agents.id, requestedAgentId),
            eq(agents.status, "active"),
            eq(wallets.status, "active"),
          )
        : and(eq(agents.status, "active"), eq(wallets.status, "active")),
    )
    .orderBy(desc(agents.createdAt))
    .limit(10);

  if (rows.length === 0) {
    throw new Error(
      requestedAgentId
        ? `WARDEN_SMOKE_AGENT_ID ${requestedAgentId} did not match an active funded agent`
        : "No active agent with an active wallet was found in the database",
    );
  }

  return rows.map((row) => ({
    agent: {
      id: row.agentId,
      name: row.name,
      status: row.status,
    },
    agentId: row.agentId,
    walletId: row.walletId,
    execution: { agentId: row.agentId },
    source: requestedAgentId ? "agent-id" : "database-latest",
  }));
}

async function findFundedAgent(
  candidates: Awaited<ReturnType<typeof resolveSmokeAgent>>,
  walletService: ReturnType<typeof createWalletService>,
) {
  for (const candidate of candidates) {
    const publicKey = await walletService.getPublicKey(candidate.walletId);
    const [celo, usdc] = await Promise.all([
      walletService.getBalance(candidate.walletId),
      walletService.getUsdcBalance(candidate.walletId),
    ]);
    if (celo.wei > 0n && usdc.raw > 0n) {
      return { ...candidate, publicKey };
    }
  }
  return undefined;
}

async function resolveSmokeUrl() {
  const explicit = arg("--url") ?? process.env.WARDEN_SMOKE_X402_URL;
  if (explicit) return { url: explicit, source: "env" };

  const query = process.env.WARDEN_SMOKE_DISCOVERY_QUERY ?? "x402 celo";
  const services = await discoverPayServices({ query, limit: 10 });
  const service =
    services.find((candidate) => candidate.minPriceUsd > 0) ?? services[0];
  if (!service) {
    throw new Error(
      "WARDEN_SMOKE_X402_URL is required because pay.sh discovery returned no x402 services",
    );
  }
  return { url: service.serviceUrl, source: `pay.sh:${service.fqn}` };
}

async function main() {
  const databaseUrl = requireEnv("DATABASE_URL");
  const rpcUrl = requireEnv("CELO_RPC_URL");
  required("WARDEN_MASTER_KEY", "needed to decrypt and sign with the custodial agent wallet");
  required("OPENAI_API_KEY", "needed so the real GPT-5.4 Mini risk layer runs");

  const agentToken =
    process.env.WARDEN_SMOKE_AGENT_TOKEN ?? process.env.WARDEN_AGENT_TOKEN;

  const smokeUrl = await resolveSmokeUrl();

  const method = process.env.WARDEN_SMOKE_METHOD ?? "GET";
  const db = createDb(databaseUrl);
  const walletService = createWalletService({ db, rpcUrl });
  const proofBuilder = createX402EvmProofBuilder(walletService, {
    rpcUrl,
    rpcUrls: {
      mainnet: process.env.CELO_MAINNET_RPC_URL,
      sepolia: process.env.CELO_SEPOLIA_RPC_URL ?? rpcUrl,
    },
  });
  const runtime = createRuntime({ db, walletService, proofBuilder });

  const candidates = await resolveSmokeAgent(db, agentToken);
  const resolved = await findFundedAgent(candidates, walletService);
  if (!resolved) {
    throw new Error(
      "No active DB agent wallet has both CELO and USDC. Fund one or set WARDEN_SMOKE_AGENT_ID to a funded agent.",
    );
  }
  assert(resolved.agent.status === "active", "smoke agent is not active");
  log(
    `resolved funded smoke agent ${resolved.agent.name} (${resolved.agentId}) via ${resolved.source}`,
  );

  const result = await runtime.executePaidRequest({
    ...resolved.execution,
    request: {
      url: smokeUrl.url,
      method,
      ...(process.env.WARDEN_SMOKE_BODY
        ? { body: JSON.parse(process.env.WARDEN_SMOKE_BODY) as unknown }
        : {}),
    },
  });

  if (result.kind === "approval_required") {
    throw new Error(
      `live workflow held for approval (${result.rule}): ${result.reason}. Approval id: ${result.approvalId}`,
    );
  }
  if (result.kind === "denied") {
    throw new Error(`live workflow denied (${result.rule}): ${result.reason}`);
  }
  if (result.kind === "failed") {
    throw new Error(`live workflow payment failed: ${result.reason}`);
  }

  assert(result.payment, "live workflow did not execute a paid x402 retry");
  const [receipt] = await db
    .select()
    .from(receipts)
    .where(eq(receipts.id, result.receiptId));
  assert(receipt?.decision === "allow", "live workflow did not write an allow receipt");
  assert(
    receipt.decisionReason?.includes("aiRisk."),
    "live workflow receipt is missing the real AI risk annotation",
  );
  assert(
    receipt.txSignature || receipt.requestHash,
    "live workflow receipt is missing payment audit data",
  );

  log(`paid ${smokeUrl.url} (${smokeUrl.source})`);
  log(`receipt ${result.receiptId} recorded ${receipt.decisionReason}`);
  console.log("Warden live workflow smoke test passed.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

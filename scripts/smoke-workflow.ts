import { loadServerEnv, requireEnv } from "@warden/core";
import { agents, createDb, eq, receipts } from "@warden/db";
import { createRuntime, resolveAgentByToken } from "@warden/runtime";
import { createWalletService } from "@warden/wallet";
import { createX402SvmProofBuilder } from "@warden/x402";

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

async function main() {
  const databaseUrl = requireEnv("DATABASE_URL");
  const rpcUrl = requireEnv("SOLANA_RPC_URL");
  required("WARDEN_MASTER_KEY", "needed to decrypt and sign with the custodial agent wallet");
  required("OPENAI_API_KEY", "needed so the real GPT-5.4 Mini risk layer runs");

  const agentToken =
    process.env.WARDEN_SMOKE_AGENT_TOKEN ?? process.env.WARDEN_AGENT_TOKEN;
  if (!agentToken) {
    throw new Error(
      "WARDEN_SMOKE_AGENT_TOKEN is required. Use a real funded smoke agent token; WARDEN_AGENT_TOKEN is accepted as a fallback.",
    );
  }

  const url = arg("--url") ?? process.env.WARDEN_SMOKE_X402_URL;
  if (!url) {
    throw new Error(
      "WARDEN_SMOKE_X402_URL is required, or pass --url=https://real-x402-provider/path",
    );
  }

  const method = process.env.WARDEN_SMOKE_METHOD ?? "GET";
  const db = createDb(databaseUrl);
  const walletService = createWalletService({ db, rpcUrl });
  const proofBuilder = createX402SvmProofBuilder(walletService, { rpcUrl });
  const runtime = createRuntime({ db, walletService, proofBuilder });

  const resolved = await resolveAgentByToken(db, agentToken);
  const [agent] = await db
    .select({ id: agents.id, name: agents.name, status: agents.status })
    .from(agents)
    .where(eq(agents.id, resolved.agentId));
  assert(agent, "smoke agent token did not resolve to an agent row");
  assert(agent.status === "active", "smoke agent is not active");

  const publicKey = await walletService.getPublicKey(resolved.walletId);
  const [sol, usdc] = await Promise.all([
    walletService.getBalance(resolved.walletId),
    walletService.getUsdcBalance(resolved.walletId),
  ]);
  assert(sol.lamports > 0, `smoke wallet has no devnet SOL for fees: ${publicKey}`);
  assert(usdc.raw > 0n, `smoke wallet has no devnet USDC: ${publicKey}`);
  log(`resolved funded smoke agent ${agent.name} (${resolved.agentId})`);

  const result = await runtime.executePaidRequest({
    agentToken,
    request: {
      url,
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

  log(`paid ${url}`);
  log(`receipt ${result.receiptId} recorded ${receipt.decisionReason}`);
  console.log("Warden live workflow smoke test passed.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

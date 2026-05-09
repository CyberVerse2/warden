import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { newId, type PaymentProof } from "@warden/core";
import {
  agentTokens,
  agents,
  approvals,
  createDb,
  eq,
  policies,
  receipts,
  spendWindows,
  users,
  wallets,
} from "@warden/db";
import {
  createRuntime,
  hashToken,
  type AiRiskAnalyzer,
} from "@warden/runtime";
import type { FetchLike, ProofBuilder } from "@warden/x402";

const USDC_DEVNET_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

loadRootEnv();

function loadRootEnv() {
  const envPath = join(ROOT_DIR, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const rawValue = trimmed.slice(eqIndex + 1).trim();
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^(['"])(.*)\1$/, "$2");
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function log(message: string) {
  console.log(`✓ ${message}`);
}

function x402Challenge(payTo = "SmokePay11111111111111111111111111111111111") {
  return {
    accepts: [
      {
        scheme: "exact",
        network: "solana-devnet",
        asset: USDC_DEVNET_MINT,
        payTo,
        maxAmountRequired: "50000",
        resource: "https://smoke.x402.local/data",
        description: "Warden workflow smoke test",
        extra: {
          facilitator: "https://facilitator.x402.local/verify",
        },
      },
    ],
  };
}

function createMockFetch(): FetchLike {
  let calls = 0;
  return async (_input, init) => {
    calls += 1;
    if (calls === 1) {
      return Response.json(x402Challenge(), { status: 402 });
    }

    assert(
      init.headers instanceof Headers ||
        (typeof init.headers === "object" &&
          init.headers !== null &&
          "PAYMENT-SIGNATURE" in init.headers),
      "paid retry did not include a payment proof header",
    );
    return Response.json({ ok: true, paid: true }, { status: 200 });
  };
}

function proofBuilder(): ProofBuilder {
  return {
    async build({ requestHash }): Promise<PaymentProof> {
      return {
        headerName: "PAYMENT-SIGNATURE",
        header: `smoke-proof.${requestHash}`,
        proofHash: `proof.${requestHash}`,
        txSignature: "smoke-tx-signature",
      };
    },
  };
}

function riskAnalyzer(level: "trusted" | "suspicious" | "high_risk"): AiRiskAnalyzer {
  return {
    async analyze() {
      return {
        level,
        summary:
          level === "high_risk"
            ? "Smoke analyzer forced a human approval hold"
            : "Smoke analyzer allowed runtime to continue",
        flags: level === "trusted" ? [] : [`smoke.${level}`],
      };
    },
  };
}

async function seedAgent(db: ReturnType<typeof createDb>, token: string) {
  const userId = newId.user();
  const agentId = newId.agent();
  const walletId = newId.wallet();
  const policyId = newId.policy();

  await db.insert(users).values({
    id: userId,
    email: `${userId}@smoke.local`,
    name: "Workflow Smoke Test",
  });
  await db.insert(agents).values({
    id: agentId,
    userId,
    name: "workflow-smoke-agent",
  });
  await db.insert(wallets).values({
    id: walletId,
    agentId,
    network: "solana-devnet",
    publicKey: `${agentId}SmokePublicKey`,
    encryptedSecret: "smoke",
    iv: "smoke",
    authTag: "smoke",
  });
  await db.insert(policies).values({
    id: policyId,
    agentId,
    version: 1,
    activatedAt: new Date(),
    config: {
      mode: "managed",
      riskPosture: "balanced",
      purpose: "Workflow smoke test",
      allowedHosts: [],
      allowedNetworks: ["solana-devnet"],
      allowedTokens: ["USDC"],
      allowedMethods: ["GET", "POST"],
      maxUsdPerRequest: 1,
      maxUsdPerDay: 5,
    },
  });
  await db.insert(agentTokens).values({
    id: newId.token(),
    agentId,
    tokenHash: hashToken(token),
    label: "workflow-smoke",
  });

  return { userId, agentId, walletId, policyId };
}

async function cleanup(db: ReturnType<typeof createDb>, userId: string | undefined) {
  if (!userId) return;
  await db.delete(users).where(eq(users.id, userId));
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for smoke:workflow");
  }

  const db = createDb();
  const token = newId.token();
  let userId: string | undefined;

  try {
    const seeded = await seedAgent(db, token);
    userId = seeded.userId;
    log("seeded temporary operator, agent, wallet, policy, and token");

    const allowRuntime = createRuntime({
      db,
      walletService: {} as never,
      proofBuilder: proofBuilder(),
      fetchImpl: createMockFetch(),
      riskAnalyzer: riskAnalyzer("suspicious"),
    });
    const allow = await allowRuntime.executePaidRequest({
      agentToken: token,
      request: {
        url: "https://new-provider.example/data",
        method: "GET",
      },
    });

    assert(allow.kind === "ok", `expected paid request to succeed, got ${allow.kind}`);
    assert(allow.payment?.amountUsd === 0.05, "expected parsed USDC amount to be $0.05");
    log("paid x402 request passed policy, AI risk, proof build, retry, and receipt write");

    const [allowReceipt] = await db
      .select()
      .from(receipts)
      .where(eq(receipts.id, allow.receiptId));
    assert(allowReceipt?.decision === "allow", "allow receipt was not written");
    assert(
      allowReceipt.decisionReason?.includes("aiRisk.suspicious"),
      "allow receipt did not include AI risk annotation",
    );

    const [spend] = await db
      .select()
      .from(spendWindows)
      .where(eq(spendWindows.agentId, seeded.agentId));
    assert(spend?.amountUsd === 0.05, "daily spend window did not increment");
    log("receipt and daily spend accounting are correct");

    const approvalRuntime = createRuntime({
      db,
      walletService: {} as never,
      proofBuilder: proofBuilder(),
      fetchImpl: createMockFetch(),
      riskAnalyzer: riskAnalyzer("high_risk"),
    });
    const approval = await approvalRuntime.executePaidRequest({
      agentToken: token,
      request: {
        url: "https://ambiguous-provider.example/data",
        method: "GET",
      },
    });
    assert(
      approval.kind === "approval_required",
      `expected AI high risk to hold for approval, got ${approval.kind}`,
    );

    const [approvalRow] = await db
      .select()
      .from(approvals)
      .where(eq(approvals.id, approval.approvalId));
    assert(approvalRow?.triggeringRule === "aiRisk.high_risk", "approval row was not AI-triggered");
    log("AI high-risk request creates a human approval hold");

    const blockedRuntime = createRuntime({
      db,
      walletService: {} as never,
      proofBuilder: proofBuilder(),
      fetchImpl: createMockFetch(),
      riskAnalyzer: riskAnalyzer("trusted"),
    });
    const blocked = await blockedRuntime.executePaidRequest({
      agentToken: token,
      request: {
        url: "https://quicknode-payments.example/drain",
        method: "GET",
      },
    });
    assert(blocked.kind === "denied", `expected threat intel denial, got ${blocked.kind}`);
    assert(blocked.rule === "threatIntel.host", "threat intel denial used the wrong rule");
    log("malicious x402 JSON blocklist denies before signing");

    await cleanup(db, userId);
    userId = undefined;
    log("cleaned up temporary workflow rows");
    console.log("Warden workflow smoke test passed.");
  } finally {
    await cleanup(db, userId);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

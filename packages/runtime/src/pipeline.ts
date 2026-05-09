import { newId, WardenError } from "@warden/core";
import { approvals, receipts, type Db } from "@warden/db";
import { evaluate, type PolicyDecision } from "@warden/policy";
import type { WalletService } from "@warden/wallet";
import {
  hashRequest,
  parseChallenge,
  sendRequest,
  type FetchLike,
  type HttpRequest,
  type ProofBuilder,
} from "@warden/x402";
import { resolveAgentById, resolveAgentByToken } from "./auth.js";
import { loadActivePolicy } from "./policy-loader.js";
import { getDailySpend, incrementDailySpend } from "./spend.js";

export interface RuntimeDeps {
  db: Db;
  walletService: WalletService;
  proofBuilder: ProofBuilder;
  fetchImpl?: FetchLike;
}

export interface ExecutePaidRequestInput {
  agentToken?: string;
  agentId?: string;
  request: HttpRequest;
  taskId?: string;
  skipPolicy?: {
    policyId?: string;
    reason: string;
  };
}

export type ExecuteResult =
  | {
      kind: "ok";
      receiptId: string;
      response: { status: number; body: unknown; headers: Record<string, string> };
      payment?: { amountUsd: number; proofHash: string };
    }
  | { kind: "denied"; receiptId: string; reason: string; rule: string }
  | { kind: "approval_required"; approvalId: string; reason: string; rule: string }
  | { kind: "failed"; receiptId: string; reason: string };

function urlHost(url: string): string {
  return new URL(url).host;
}

export interface Runtime {
  executePaidRequest(input: ExecutePaidRequestInput): Promise<ExecuteResult>;
  dryRun(input: ExecutePaidRequestInput): Promise<PolicyDecision | { kind: "no_payment_required" }>;
}

export function createRuntime(deps: RuntimeDeps): Runtime {
  const { db, walletService, proofBuilder, fetchImpl } = deps;

  async function executePaidRequest(
    input: ExecutePaidRequestInput,
  ): Promise<ExecuteResult> {
    // 1. Identify agent
    const agent = input.agentToken
      ? await resolveAgentByToken(db, input.agentToken)
      : input.agentId
      ? await resolveAgentById(db, input.agentId)
      : undefined;
    if (!agent) {
      throw new WardenError("unauthorized", "Agent token or agent id is required");
    }
    if (agent.status === "revoked") {
      throw new WardenError("agent_revoked", "Agent is revoked");
    }

    // 2. Send original request
    const host = urlHost(input.request.url);
    const reqHash = hashRequest(input.request);
    const initial = await sendRequest(input.request, fetchImpl);

    // 3. Not 402: pass-through, no policy check, record an allow receipt with no payment.
    if (initial.status !== 402) {
      const receiptId = newId.receipt();
      await db.insert(receipts).values({
        id: receiptId,
        agentId: agent.agentId,
        walletId: agent.walletId,
        url: input.request.url,
        method: input.request.method.toUpperCase(),
        host,
        decision: "allow",
        decisionReason: "no_payment_required",
        responseStatus: initial.status,
        requestHash: reqHash,
        ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
      });
      return {
        kind: "ok",
        receiptId,
        response: {
          status: initial.status,
          body: initial.body,
          headers: initial.headers,
        },
      };
    }

    // 4. Parse 402 challenge
    const challenge = parseChallenge(initial.body);

    // 5. Load policy + today's spend
    const { policyId, config: policy } = await loadActivePolicy(db, agent.agentId);
    const dayUsd = await getDailySpend(db, agent.agentId);

    // 6. Evaluate (the critical control point)
    const decision = input.skipPolicy
      ? ({ kind: "allow" } as const)
      : evaluate({
          agent: { id: agent.agentId, status: agent.status },
          challenge: {
            amountUsd: challenge.requirement.amountUsd,
            recipient: challenge.requirement.recipient,
            network: challenge.requirement.network,
            token: challenge.requirement.token,
          },
          request: {
            url: input.request.url,
            method: input.request.method,
            host,
          },
          spendToDate: { dayUsd },
          policy,
        });

    if (decision.kind === "deny") {
      const receiptId = newId.receipt();
      await db.insert(receipts).values({
        id: receiptId,
        agentId: agent.agentId,
        walletId: agent.walletId,
        policyId,
        url: input.request.url,
        method: input.request.method.toUpperCase(),
        host,
        amountRaw: challenge.requirement.amountRaw,
        amountUsd: challenge.requirement.amountUsd,
        currency: challenge.requirement.token,
        network: challenge.requirement.network,
        recipient: challenge.requirement.recipient,
        challengeHash: challenge.hash,
        requestHash: reqHash,
        responseStatus: 402,
        decision: "deny",
        decisionReason: `${decision.rule}: ${decision.reason}`,
        ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
      });
      return {
        kind: "denied",
        receiptId,
        reason: decision.reason,
        rule: decision.rule,
      };
    }

    if (decision.kind === "requires_approval") {
      const approvalId = newId.approval();
      await db.insert(approvals).values({
        id: approvalId,
        agentId: agent.agentId,
        amountUsd: challenge.requirement.amountUsd,
        triggeringRule: decision.rule,
        requestSnapshot: {
          request: input.request,
          challenge: challenge.requirement,
          taskId: input.taskId,
        },
        status: "pending",
      });
      return {
        kind: "approval_required",
        approvalId,
        reason: decision.reason,
        rule: decision.rule,
      };
    }

    // 7. Sign the proof
    const proof = await proofBuilder.build({
      walletId: agent.walletId,
      challenge,
      requestHash: reqHash,
    });

    // 8. Retry with payment header
    const paid = await sendRequest(
      {
        ...input.request,
        headers: { ...(input.request.headers ?? {}), "X-PAYMENT": proof.header },
      },
      fetchImpl,
    );

    const succeeded = paid.status >= 200 && paid.status < 300;
    const receiptId = newId.receipt();

    if (succeeded) {
      // Increment counter before recording the receipt so concurrent calls see
      // the update; failure to increment is non-fatal but logged on the receipt.
      await incrementDailySpend(db, agent.agentId, challenge.requirement.amountUsd);
    }

    await db.insert(receipts).values({
      id: receiptId,
      agentId: agent.agentId,
      walletId: agent.walletId,
      policyId,
      url: input.request.url,
      method: input.request.method.toUpperCase(),
      host,
      amountRaw: challenge.requirement.amountRaw,
      amountUsd: challenge.requirement.amountUsd,
      currency: challenge.requirement.token,
      network: challenge.requirement.network,
      recipient: challenge.requirement.recipient,
      challengeHash: challenge.hash,
      requestHash: reqHash,
      responseStatus: paid.status,
      ...(proof.txSignature !== undefined ? { txSignature: proof.txSignature } : {}),
      decision: succeeded ? "allow" : "failed",
      decisionReason: succeeded
        ? input.skipPolicy?.reason ?? "policy.allow"
        : `payment_failed:${paid.status}`,
      ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
    });

    if (!succeeded) {
      return {
        kind: "failed",
        receiptId,
        reason: `Paid retry returned ${paid.status}`,
      };
    }

    return {
      kind: "ok",
      receiptId,
      response: { status: paid.status, body: paid.body, headers: paid.headers },
      payment: {
        amountUsd: challenge.requirement.amountUsd,
        proofHash: proof.proofHash,
      },
    };
  }

  async function dryRun(input: ExecutePaidRequestInput) {
    if (!input.agentToken) {
      throw new WardenError("unauthorized", "Agent token is required for dry runs");
    }
    const agent = await resolveAgentByToken(db, input.agentToken);
    const initial = await sendRequest(input.request, fetchImpl);
    if (initial.status !== 402) return { kind: "no_payment_required" as const };

    const challenge = parseChallenge(initial.body);
    const { config: policy } = await loadActivePolicy(db, agent.agentId);
    const dayUsd = await getDailySpend(db, agent.agentId);

    return evaluate({
      agent: { id: agent.agentId, status: agent.status },
      challenge: {
        amountUsd: challenge.requirement.amountUsd,
        recipient: challenge.requirement.recipient,
        network: challenge.requirement.network,
        token: challenge.requirement.token,
      },
      request: {
        url: input.request.url,
        method: input.request.method,
        host: urlHost(input.request.url),
      },
      spendToDate: { dayUsd },
      policy,
    });
  }

  return { executePaidRequest, dryRun };
}

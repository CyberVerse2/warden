import { newId, WardenError } from "@warden/core";
import { and, approvals, eq, receipts, type Db } from "@warden/db";
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
import { resolveAgentById, resolveAgentByToken } from "./auth";
import {
  createOpenAiRiskAnalyzer,
  type AiRiskAnalyzer,
  type AiRiskResult,
} from "./ai-risk";
import { loadActivePolicy } from "./policy-loader";
import { getDailySpend, incrementDailySpend } from "./spend";
import { findMaliciousX402 } from "./threat-intel";

export interface RuntimeDeps {
  db: Db;
  walletService: WalletService;
  proofBuilder: ProofBuilder;
  fetchImpl?: FetchLike;
  riskAnalyzer?: AiRiskAnalyzer;
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
  const {
    db,
    walletService,
    proofBuilder,
    fetchImpl,
    riskAnalyzer = createOpenAiRiskAnalyzer(),
  } = deps;

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

    // 4. Load policy + today's spend
    const { policyId, config: policy } = await loadActivePolicy(db, agent.agentId);
    const dayUsd = await getDailySpend(db, agent.agentId);

    // 5. Parse the first policy-compatible 402 challenge.
    const challenge = parseChallenge(initial.body, {
      allowedNetworks: policy.allowedNetworks,
      allowedTokens: policy.allowedTokens,
    }, initial.headers);

    const threat = findMaliciousX402({
      url: input.request.url,
      host,
      challenge,
    });
    if (threat) {
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
        decisionReason: `${threat.rule}: ${threat.reason}`,
        ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
      });
      return {
        kind: "denied",
        receiptId,
        reason: threat.reason,
        rule: threat.rule,
      };
    }

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
      const approval = await findOrCreateApproval({
        agentId: agent.agentId,
        amountUsd: challenge.requirement.amountUsd,
        triggeringRule: decision.rule,
        requestSnapshot: {
          request: input.request,
          challenge: challenge.requirement,
          requestHash: reqHash,
          challengeHash: challenge.hash,
          taskId: input.taskId,
        },
        requestHash: reqHash,
        challengeHash: challenge.hash,
      });
      return {
        kind: "approval_required",
        approvalId: approval.id,
        reason: decision.reason,
        rule: decision.rule,
      };
    }

    const aiRisk =
      !input.skipPolicy && riskAnalyzer
        ? await riskAnalyzer.analyze({
            request: input.request,
            host,
            challenge,
            policy,
            spendToDateUsd: dayUsd,
          })
        : undefined;

    if (aiRisk?.level === "high_risk") {
      const approval = await findOrCreateApproval({
        agentId: agent.agentId,
        amountUsd: challenge.requirement.amountUsd,
        triggeringRule: "aiRisk.high_risk",
        requestSnapshot: {
          request: input.request,
          challenge: challenge.requirement,
          requestHash: reqHash,
          challengeHash: challenge.hash,
          taskId: input.taskId,
          aiRisk,
        },
        requestHash: reqHash,
        challengeHash: challenge.hash,
      });
      return {
        kind: "approval_required",
        approvalId: approval.id,
        reason: aiRisk.summary,
        rule: "aiRisk.high_risk",
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
        headers: {
          ...(input.request.headers ?? {}),
          [proof.headerName ?? "X-PAYMENT"]: proof.header,
          ...(proof.extraHeaders ?? {}),
        },
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
        ? input.skipPolicy?.reason ?? allowReason(aiRisk)
        : `payment_failed:${paid.status}`,
      ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
    });

    const failureDetail =
      !succeeded && paid.rawBody
        ? `: ${paid.rawBody.slice(0, 2_000)}`
        : "";

    if (!succeeded) {
      return {
        kind: "failed",
        receiptId,
        reason: `Paid retry returned ${paid.status}${failureDetail}`,
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

    const { config: policy } = await loadActivePolicy(db, agent.agentId);
    const challenge = parseChallenge(
      initial.body,
      {
        allowedNetworks: policy.allowedNetworks,
        allowedTokens: policy.allowedTokens,
      },
      initial.headers,
    );
    const threat = findMaliciousX402({
      url: input.request.url,
      host: urlHost(input.request.url),
      challenge,
    });
    if (threat) {
      return {
        kind: "deny" as const,
        reason: threat.reason,
        rule: threat.rule,
      };
    }
    const dayUsd = await getDailySpend(db, agent.agentId);
    const decision = evaluate({
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
    if (decision.kind !== "allow") return decision;

    const aiRisk = riskAnalyzer
      ? await riskAnalyzer.analyze({
          request: input.request,
          host: urlHost(input.request.url),
          challenge,
          policy,
          spendToDateUsd: dayUsd,
        })
      : undefined;
    if (aiRisk?.level === "high_risk") {
      return {
        kind: "requires_approval" as const,
        reason: aiRisk.summary,
        rule: "aiRisk.high_risk",
      };
    }
    return decision;
  }

  return { executePaidRequest, dryRun };

  async function findOrCreateApproval(args: {
    agentId: string;
    amountUsd: number;
    triggeringRule: string;
    requestSnapshot: Record<string, unknown>;
    requestHash: string;
    challengeHash: string;
  }) {
    const pending = await db
      .select({
        id: approvals.id,
        requestSnapshot: approvals.requestSnapshot,
      })
      .from(approvals)
      .where(
        and(
          eq(approvals.agentId, args.agentId),
          eq(approvals.status, "pending"),
        ),
      );
    const existing = pending.find((row) => {
      const snapshot = row.requestSnapshot as
        | { requestHash?: string; challengeHash?: string }
        | null;
      return (
        snapshot?.requestHash === args.requestHash &&
        snapshot.challengeHash === args.challengeHash
      );
    });
    if (existing) return { id: existing.id };

    const approvalId = newId.approval();
    await db.insert(approvals).values({
      id: approvalId,
      agentId: args.agentId,
      amountUsd: args.amountUsd,
      triggeringRule: args.triggeringRule,
      requestSnapshot: args.requestSnapshot,
      status: "pending",
    });
    return { id: approvalId };
  }
}

function allowReason(aiRisk: AiRiskResult | undefined) {
  if (!aiRisk) return "policy.allow";
  return `policy.allow; aiRisk.${aiRisk.level}: ${aiRisk.summary}`;
}

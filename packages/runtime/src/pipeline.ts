import { newId, WardenError } from "@warden/core";
import { and, approvals, eq, receipts, type Db } from "@warden/db";
import { evaluate, type PolicyDecision } from "@warden/policy";
import type { WalletService } from "@warden/wallet";
import {
  createMppProofBuilder,
  hashRequest,
  mppResponseFromChallenge,
  parseChallenge,
  parseMppChallenge,
  sendRequest,
  type FetchLike,
  type HttpRequest,
  type MppProofBuilder,
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
  mppProofBuilder?: MppProofBuilder;
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

function isZeroValueFollowupRequest(request: HttpRequest) {
  if (request.method.toUpperCase() !== "GET") return false;
  try {
    const url = new URL(request.url);
    return (
      url.hostname === "fal.x402.paysponge.com" &&
      /\/requests\/[^/]+(?:\/status)?\/?$/.test(url.pathname)
    );
  } catch {
    return false;
  }
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
    mppProofBuilder = createMppProofBuilder(walletService),
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

    // 3. Not 402: pass-through, no policy check, record success/failure with no payment.
    if (initial.status !== 402) {
      const succeeded = initial.status >= 200 && initial.status < 300;
      const receiptId = newId.receipt();
      await db.insert(receipts).values({
        id: receiptId,
        agentId: agent.agentId,
        walletId: agent.walletId,
        url: input.request.url,
        method: input.request.method.toUpperCase(),
        host,
        decision: succeeded ? "allow" : "failed",
        decisionReason: succeeded
          ? "no_payment_required"
          : `provider_http_error:${initial.status}`,
        responseStatus: initial.status,
        requestHash: reqHash,
        ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
      });
      if (!succeeded) {
        const failureDetail = initial.rawBody
          ? `: ${initial.rawBody.slice(0, 2_000)}`
          : "";
        return {
          kind: "failed",
          receiptId,
          reason: `Provider returned ${initial.status}${failureDetail}`,
        };
      }
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

    const mppChallenge = parseMppChallenge(initial.headers, {
      allowedNetworks: policy.allowedNetworks,
      allowedTokens: policy.allowedTokens,
    });
    if (mppChallenge) {
      if (
        mppChallenge.requirement.amountUsd === 0 &&
        !isZeroValueFollowupRequest(input.request)
      ) {
        const receiptId = newId.receipt();
        await db.insert(receipts).values({
          id: receiptId,
          agentId: agent.agentId,
          walletId: agent.walletId,
          policyId,
          url: input.request.url,
          method: input.request.method.toUpperCase(),
          host,
          amountRaw: mppChallenge.requirement.amountRaw,
          amountUsd: 0,
          currency: mppChallenge.requirement.token,
          network: mppChallenge.requirement.network,
          recipient: mppChallenge.requirement.recipient,
          challengeHash: mppChallenge.hash,
          requestHash: reqHash,
          responseStatus: 402,
          decision: "allow",
          decisionReason: "zero_payment_required",
          ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
        });
        return {
          kind: "failed",
          receiptId,
          reason:
            "Provider returned a zero-value MPP payment challenge; Warden did not sign a zero-value transfer.",
        };
      }
      const decision = input.skipPolicy
        ? ({ kind: "allow" } as const)
        : evaluate({
            agent: { id: agent.agentId, status: agent.status },
            challenge: {
              amountUsd: mppChallenge.requirement.amountUsd,
              recipient: mppChallenge.requirement.recipient,
              network: mppChallenge.requirement.network,
              token: mppChallenge.requirement.token,
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
          amountRaw: mppChallenge.requirement.amountRaw,
          amountUsd: mppChallenge.requirement.amountUsd,
          currency: mppChallenge.requirement.token,
          network: mppChallenge.requirement.network,
          recipient: mppChallenge.requirement.recipient,
          challengeHash: mppChallenge.hash,
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
          amountUsd: mppChallenge.requirement.amountUsd,
          triggeringRule: decision.rule,
          requestSnapshot: {
            request: input.request,
            challenge: mppChallenge.requirement,
            protocol: "mpp",
            requestHash: reqHash,
            challengeHash: mppChallenge.hash,
            taskId: input.taskId,
          },
          requestHash: reqHash,
          challengeHash: mppChallenge.hash,
        });
        return {
          kind: "approval_required",
          approvalId: approval.id,
          reason: decision.reason,
          rule: decision.rule,
        };
      }

      let proof;
      try {
        proof = await mppProofBuilder.build({
          walletId: agent.walletId,
          challenge: mppChallenge,
          response: mppResponseFromChallenge(mppChallenge),
        });
      } catch (error) {
        const receiptId = newId.receipt();
        const reason = `mpp_payment_proof_failed:${errorMessage(error)}`;
        await db.insert(receipts).values({
          id: receiptId,
          agentId: agent.agentId,
          walletId: agent.walletId,
          policyId,
          url: input.request.url,
          method: input.request.method.toUpperCase(),
          host,
          amountRaw: mppChallenge.requirement.amountRaw,
          amountUsd: mppChallenge.requirement.amountUsd,
          currency: mppChallenge.requirement.token,
          network: mppChallenge.requirement.network,
          recipient: mppChallenge.requirement.recipient,
          challengeHash: mppChallenge.hash,
          requestHash: reqHash,
          responseStatus: 402,
          decision: "failed",
          decisionReason: reason,
          ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
        });
        return {
          kind: "failed",
          receiptId,
          reason,
        };
      }

      const paid = await sendRequest(
        {
          ...input.request,
          headers: {
            ...(input.request.headers ?? {}),
            [proof.headerName ?? "Authorization"]: proof.header,
            ...(proof.extraHeaders ?? {}),
          },
        },
        fetchImpl,
      );

      const succeeded = paid.status >= 200 && paid.status < 300;
      const receiptId = newId.receipt();
      if (succeeded) {
        await incrementDailySpend(db, agent.agentId, mppChallenge.requirement.amountUsd);
      }
      await db.insert(receipts).values({
        id: receiptId,
        agentId: agent.agentId,
        walletId: agent.walletId,
        policyId,
        url: input.request.url,
        method: input.request.method.toUpperCase(),
        host,
        amountRaw: mppChallenge.requirement.amountRaw,
        amountUsd: mppChallenge.requirement.amountUsd,
        currency: mppChallenge.requirement.token,
        network: mppChallenge.requirement.network,
        recipient: mppChallenge.requirement.recipient,
        challengeHash: mppChallenge.hash,
        requestHash: reqHash,
        responseStatus: paid.status,
        decision: succeeded ? "allow" : "failed",
        decisionReason: succeeded
          ? input.skipPolicy?.reason ?? "policy.allow:mpp"
          : `mpp_payment_failed:${paid.status}`,
        ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
      });

      const failureDetail =
        !succeeded && paid.rawBody ? `: ${paid.rawBody.slice(0, 2_000)}` : "";
      if (!succeeded) {
        return {
          kind: "failed",
          receiptId,
          reason: `MPP paid retry returned ${paid.status}${failureDetail}`,
        };
      }
      return {
        kind: "ok",
        receiptId,
        response: { status: paid.status, body: paid.body, headers: paid.headers },
        payment: {
          amountUsd: mppChallenge.requirement.amountUsd,
          proofHash: proof.proofHash,
        },
      };
    }

    // 5. Parse the first policy-compatible 402 challenge.
    const challenge = parseChallenge(initial.body, {
      allowedNetworks: policy.allowedNetworks,
      allowedTokens: policy.allowedTokens,
    }, initial.headers);
    if (
      challenge.requirement.amountUsd === 0 &&
      !isZeroValueFollowupRequest(input.request)
    ) {
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
        amountUsd: 0,
        currency: challenge.requirement.token,
        network: challenge.requirement.network,
        recipient: challenge.requirement.recipient,
        challengeHash: challenge.hash,
        requestHash: reqHash,
        responseStatus: 402,
        decision: "allow",
        decisionReason: "zero_payment_required",
        ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
      });
      return {
        kind: "failed",
        receiptId,
        reason:
          "Provider returned a zero-value x402 payment challenge; Warden did not sign a zero-value transfer.",
      };
    }

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
    let proof;
    try {
      proof = await proofBuilder.build({
        walletId: agent.walletId,
        challenge,
        requestHash: reqHash,
      });
    } catch (error) {
      const receiptId = newId.receipt();
      const reason = `payment_proof_failed:${errorMessage(error)}`;
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
        decision: "failed",
        decisionReason: reason,
        ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
      });
      return {
        kind: "failed",
        receiptId,
        reason,
      };
    }

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
    const mppChallenge = parseMppChallenge(initial.headers, {
      allowedNetworks: policy.allowedNetworks,
      allowedTokens: policy.allowedTokens,
    });
    if (mppChallenge) {
      if (mppChallenge.requirement.amountUsd === 0) {
        return { kind: "no_payment_required" as const };
      }
      const dayUsd = await getDailySpend(db, agent.agentId);
      return evaluate({
        agent: { id: agent.agentId, status: agent.status },
        challenge: {
          amountUsd: mppChallenge.requirement.amountUsd,
          recipient: mppChallenge.requirement.recipient,
          network: mppChallenge.requirement.network,
          token: mppChallenge.requirement.token,
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
    const challenge = parseChallenge(
      initial.body,
      {
        allowedNetworks: policy.allowedNetworks,
        allowedTokens: policy.allowedTokens,
      },
      initial.headers,
    );
    if (challenge.requirement.amountUsd === 0) {
      return { kind: "no_payment_required" as const };
    }
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

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

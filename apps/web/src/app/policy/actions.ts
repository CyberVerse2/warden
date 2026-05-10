"use server";

import { agents, policies } from "@warden/db";
import { PolicyConfigSchema } from "@warden/core";
import { evaluate, type PolicyDecision } from "@warden/policy";
import { getDailySpend } from "@warden/runtime";
import { parseChallenge } from "@warden/x402/challenge";
import { sendRequest } from "@warden/x402/http-client";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getCurrentUser } from "~/lib/auth";
import { getDb } from "~/lib/db";

export interface DryRunResult {
  agentName: string;
  agentId: string;
  decision: PolicyDecision | { kind: "no_payment_required"; status: number };
  amountUsd: number;
  todayUsd: number;
  network?: string;
  token?: string;
}

function s(formData: FormData, key: string) {
  const v = formData.get(key);
  if (typeof v !== "string" || !v.trim()) {
    throw new Error(`${key} is required`);
  }
  return v.trim();
}

export async function dryRunPolicy(
  _prev: DryRunResult | { error: string } | undefined,
  formData: FormData,
): Promise<DryRunResult | { error: string }> {
  try {
    const db = getDb();
    const currentUser = await getCurrentUser();
    const agentId = s(formData, "agentId");
    const url = s(formData, "url");
    const method = s(formData, "method").toUpperCase();
    if (!agentId || !url) return { error: "Agent and URL are required" };

    const [agentRow] = await db
      .select({ id: agents.id, name: agents.name, status: agents.status })
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.userId, currentUser.id)));
    if (!agentRow) return { error: "Agent not found" };

    const [policyRow] = await db
      .select()
      .from(policies)
      .where(and(eq(policies.agentId, agentId), isNotNull(policies.activatedAt)))
      .orderBy(desc(policies.version))
      .limit(1);
    if (!policyRow) return { error: "Agent has no active policy" };

    const policy = PolicyConfigSchema.parse(policyRow.config);
    const todayUsd = await getDailySpend(db, agentId);

    const request = { url, method };
    const initial = await sendRequest(request);
    if (initial.status !== 402) {
      return {
        agentName: agentRow.name,
        agentId: agentRow.id,
        decision: { kind: "no_payment_required", status: initial.status },
        amountUsd: 0,
        todayUsd,
      };
    }
    const challenge = parseChallenge(
      initial.body,
      {
        allowedNetworks: policy.allowedNetworks,
        allowedTokens: policy.allowedTokens,
      },
      initial.headers,
    );
    const host = new URL(url).host;

    const decision = evaluate({
      agent: { id: agentRow.id, status: agentRow.status },
      challenge: {
        amountUsd: challenge.requirement.amountUsd,
        recipient: challenge.requirement.recipient,
        network: challenge.requirement.network,
        token: challenge.requirement.token,
      },
      request: { url, method, host },
      spendToDate: { dayUsd: todayUsd },
      policy,
    });

    return {
      agentName: agentRow.name,
      agentId: agentRow.id,
      decision,
      amountUsd: challenge.requirement.amountUsd,
      todayUsd,
      network: challenge.requirement.network,
      token: challenge.requirement.token,
    };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

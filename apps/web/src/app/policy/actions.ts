"use server";

import { agents, policies } from "@warden/db";
import { PolicyConfigSchema } from "@warden/core";
import { evaluate, type PolicyDecision } from "@warden/policy";
import { getDailySpend } from "@warden/runtime";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getCurrentUser } from "~/lib/auth";
import { getDb } from "~/lib/db";

export interface DryRunResult {
  agentName: string;
  agentId: string;
  decision: PolicyDecision;
  amountUsd: number;
  todayUsd: number;
}

function n(formData: FormData, key: string) {
  const v = formData.get(key);
  if (typeof v !== "string" || !v) {
    throw new Error(`${key} is required`);
  }
  const num = Number(v);
  if (!Number.isFinite(num)) {
    throw new Error(`${key} must be a number`);
  }
  return num;
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
    const amountUsd = n(formData, "amountUsd");
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
      .orderBy(desc(policies.activatedAt))
      .limit(1);
    if (!policyRow) return { error: "Agent has no active policy" };

    const policy = PolicyConfigSchema.parse(policyRow.config);
    const todayUsd = await getDailySpend(db, agentId);

    const host = new URL(url).host;
    const network = policy.allowedNetworks[0];
    const token = policy.allowedTokens[0];
    if (!network || !token) {
      throw new Error("Policy must include at least one network and token");
    }

    const decision = evaluate({
      agent: { id: agentRow.id, status: agentRow.status },
      challenge: {
        amountUsd,
        recipient: "dry-run",
        network,
        token,
      },
      request: { url, method, host },
      spendToDate: { dayUsd: todayUsd },
      policy,
    });

    return {
      agentName: agentRow.name,
      agentId: agentRow.id,
      decision,
      amountUsd,
      todayUsd,
    };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

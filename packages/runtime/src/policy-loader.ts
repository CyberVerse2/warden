import {
  DEFAULT_POLICY,
  PolicyConfigSchema,
  WardenError,
  type PolicyConfig,
} from "@warden/core";
import { and, desc, eq, isNotNull, policies, type Db } from "@warden/db";

export interface LoadedPolicy {
  policyId: string;
  config: PolicyConfig;
}

export async function loadActivePolicy(
  db: Db,
  agentId: string,
): Promise<LoadedPolicy> {
  const [row] = await db
    .select()
    .from(policies)
    .where(and(eq(policies.agentId, agentId), isNotNull(policies.activatedAt)))
    .orderBy(desc(policies.activatedAt))
    .limit(1);

  if (!row) {
    throw new WardenError(
      "policy_not_found",
      "No active policy. Warden denies by default.",
      { agentId, defaults: DEFAULT_POLICY },
    );
  }

  const parsed = PolicyConfigSchema.safeParse(row.config);
  if (!parsed.success) {
    throw new WardenError(
      "policy_not_found",
      "Active policy is malformed",
      { agentId, issues: parsed.error.issues },
    );
  }

  return { policyId: row.id, config: parsed.data };
}

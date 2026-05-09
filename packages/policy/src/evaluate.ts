import type {
  AgentStatus,
  Network,
  PolicyConfig,
  SupportedToken,
} from "@warden/core";

export interface PolicyInput {
  agent: { id: string; status: AgentStatus };
  challenge: {
    amountUsd: number;
    recipient: string;
    network: Network;
    token: SupportedToken;
  };
  request: { url: string; method: string; host: string };
  spendToDate: { dayUsd: number };
  policy: PolicyConfig;
}

export type PolicyDecision =
  | { kind: "allow" }
  | { kind: "deny"; reason: string; rule: string }
  | { kind: "requires_approval"; reason: string; rule: string };

const RULES = {
  REVOKED: "agent.revoked",
  HOST: "policy.allowedHosts",
  NETWORK: "policy.allowedNetworks",
  TOKEN: "policy.allowedTokens",
  METHOD: "policy.allowedMethods",
  REQUEST_CAP: "policy.maxUsdPerRequest",
  DAILY_CAP: "policy.maxUsdPerDay",
  APPROVAL: "policy.approvalThresholdUsd",
} as const;

export function evaluate(input: PolicyInput): PolicyDecision {
  const { agent, challenge, request, spendToDate, policy } = input;

  if (agent.status === "revoked") {
    return {
      kind: "deny",
      rule: RULES.REVOKED,
      reason: "Agent is revoked",
    };
  }

  if (
    policy.mode !== "managed" &&
    (policy.allowedHosts.length === 0 ||
      !policy.allowedHosts.includes(request.host))
  ) {
    return {
      kind: "deny",
      rule: RULES.HOST,
      reason: `Host "${request.host}" is not in the allowlist`,
    };
  }

  if (!policy.allowedNetworks.includes(challenge.network)) {
    return {
      kind: "deny",
      rule: RULES.NETWORK,
      reason: `Network "${challenge.network}" is not allowed`,
    };
  }

  if (!policy.allowedTokens.includes(challenge.token)) {
    return {
      kind: "deny",
      rule: RULES.TOKEN,
      reason: `Token "${challenge.token}" is not allowed`,
    };
  }

  const method = request.method.toUpperCase() as PolicyConfig["allowedMethods"][number];
  if (!policy.allowedMethods.includes(method)) {
    return {
      kind: "deny",
      rule: RULES.METHOD,
      reason: `Method "${method}" is not allowed`,
    };
  }

  if (challenge.amountUsd > policy.maxUsdPerRequest) {
    return {
      kind: "deny",
      rule: RULES.REQUEST_CAP,
      reason: `$${challenge.amountUsd.toFixed(4)} exceeds per-request cap of $${policy.maxUsdPerRequest.toFixed(2)}`,
    };
  }

  const projectedDay = spendToDate.dayUsd + challenge.amountUsd;
  if (projectedDay > policy.maxUsdPerDay) {
    return {
      kind: "deny",
      rule: RULES.DAILY_CAP,
      reason: `Spending $${challenge.amountUsd.toFixed(4)} would push today's total to $${projectedDay.toFixed(4)}, above daily cap of $${policy.maxUsdPerDay.toFixed(2)}`,
    };
  }

  if (
    policy.approvalThresholdUsd !== undefined &&
    challenge.amountUsd >= policy.approvalThresholdUsd
  ) {
    return {
      kind: "requires_approval",
      rule: RULES.APPROVAL,
      reason: `Amount $${challenge.amountUsd.toFixed(4)} is at or above approval threshold $${policy.approvalThresholdUsd.toFixed(2)}`,
    };
  }

  return { kind: "allow" };
}

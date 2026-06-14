import { describe, expect, it } from "vitest";
import {
  CELO_MAINNET_NETWORK,
  CELO_SEPOLIA_NETWORK,
  type PolicyConfig,
} from "@warden/core";
import { evaluate, type PolicyInput } from "./evaluate";

const basePolicy: PolicyConfig = {
  mode: "advanced",
  riskPosture: "balanced",
  allowedHosts: ["x402.example.com"],
  allowedNetworks: [CELO_SEPOLIA_NETWORK],
  allowedTokens: ["USDC"],
  allowedMethods: ["GET", "POST"],
  maxUsdPerRequest: 0.5,
  maxUsdPerDay: 5,
};

const baseInput = (overrides: Partial<PolicyInput> = {}): PolicyInput => ({
  agent: { id: "agt_1", status: "active" },
  challenge: {
    amountUsd: 0.1,
    recipient: "rec",
    network: CELO_SEPOLIA_NETWORK,
    token: "USDC",
  },
  request: {
    url: "https://x402.example.com/foo",
    method: "GET",
    host: "x402.example.com",
  },
  spendToDate: { dayUsd: 0 },
  policy: basePolicy,
  ...overrides,
});

describe("policy.evaluate", () => {
  it("allows a baseline-compliant request", () => {
    expect(evaluate(baseInput()).kind).toBe("allow");
  });

  it("denies a revoked agent first, even if everything else passes", () => {
    const d = evaluate(
      baseInput({ agent: { id: "agt_1", status: "revoked" } }),
    );
    expect(d).toMatchObject({ kind: "deny", rule: "agent.revoked" });
  });

  it("denies hosts not in the allowlist", () => {
    const d = evaluate(
      baseInput({
        request: {
          url: "https://evil.com",
          method: "GET",
          host: "evil.com",
        },
      }),
    );
    expect(d).toMatchObject({ kind: "deny", rule: "policy.allowedHosts" });
  });

  it("does not require manual host allowlists in managed mode", () => {
    const d = evaluate(
      baseInput({
        policy: {
          ...basePolicy,
          mode: "managed",
          allowedHosts: [],
        },
        request: {
          url: "https://new-provider.example/pay",
          method: "GET",
          host: "new-provider.example",
        },
      }),
    );
    expect(d).toMatchObject({ kind: "allow" });
  });

  it("does not block every host when advanced mode has no host allowlist", () => {
    const d = evaluate(
      baseInput({
        policy: {
          ...basePolicy,
          allowedHosts: [],
        },
        request: {
          url: "https://new-provider.example/pay",
          method: "GET",
          host: "new-provider.example",
        },
      }),
    );
    expect(d).toMatchObject({ kind: "allow" });
  });

  it("denies disallowed networks", () => {
    const d = evaluate(
      baseInput({
        challenge: {
          amountUsd: 0.1,
          recipient: "rec",
          network: CELO_MAINNET_NETWORK,
          token: "USDC",
        },
      }),
    );
    expect(d).toMatchObject({ kind: "deny", rule: "policy.allowedNetworks" });
  });

  it("denies disallowed tokens", () => {
    const d = evaluate(
      baseInput({
        challenge: {
          amountUsd: 0.1,
          recipient: "rec",
          network: CELO_SEPOLIA_NETWORK,
          token: "USDC",
        },
        policy: { ...basePolicy, allowedTokens: [] },
      }),
    );
    expect(d).toMatchObject({ kind: "deny", rule: "policy.allowedTokens" });
  });

  it("denies amounts above per-request cap", () => {
    const d = evaluate(
      baseInput({
        challenge: {
          amountUsd: 0.6,
          recipient: "rec",
          network: CELO_SEPOLIA_NETWORK,
          token: "USDC",
        },
      }),
    );
    expect(d).toMatchObject({ kind: "deny", rule: "policy.maxUsdPerRequest" });
  });

  it("denies when projected daily total exceeds cap", () => {
    const d = evaluate(
      baseInput({
        challenge: {
          amountUsd: 0.4,
          recipient: "rec",
          network: CELO_SEPOLIA_NETWORK,
          token: "USDC",
        },
        spendToDate: { dayUsd: 4.8 },
      }),
    );
    expect(d).toMatchObject({ kind: "deny", rule: "policy.maxUsdPerDay" });
  });

  it("requires approval at or above the approval threshold", () => {
    const d = evaluate(
      baseInput({
        policy: { ...basePolicy, approvalThresholdUsd: 0.05 },
      }),
    );
    expect(d).toMatchObject({
      kind: "requires_approval",
      rule: "policy.approvalThresholdUsd",
    });
  });

  it("revocation rule beats host check (order is deterministic)", () => {
    const d = evaluate(
      baseInput({
        agent: { id: "agt_1", status: "revoked" },
        request: {
          url: "https://evil.com",
          method: "GET",
          host: "evil.com",
        },
      }),
    );
    expect(d).toMatchObject({ rule: "agent.revoked" });
  });
});

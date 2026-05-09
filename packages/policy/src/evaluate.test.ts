import { describe, expect, it } from "vitest";
import type { PolicyConfig } from "@warden/core";
import { evaluate, type PolicyInput } from "./evaluate";

const basePolicy: PolicyConfig = {
  allowedHosts: ["x402.example.com"],
  allowedNetworks: ["solana-devnet"],
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
    network: "solana-devnet",
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

  it("denies disallowed networks", () => {
    const d = evaluate(
      baseInput({
        challenge: {
          amountUsd: 0.1,
          recipient: "rec",
          network: "solana-mainnet",
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
          network: "solana-devnet",
          token: "SOL",
        },
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
          network: "solana-devnet",
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
          network: "solana-devnet",
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

import { describe, expect, it } from "vitest";
import { CELO_SEPOLIA_NETWORK } from "@warden/core";
import { parseChallenge } from "@warden/x402";
import { findMaliciousX402 } from "./threat-intel";

function challenge(overrides: Record<string, unknown> = {}) {
  return parseChallenge({
    accepts: [
      {
        scheme: "exact",
        network: CELO_SEPOLIA_NETWORK,
        asset: "0x01C5C0122039549AD1493B8220cABEdD739BC44E",
        payTo: "safe-recipient",
        maxAmountRequired: "1000",
        ...overrides,
      },
    ],
  });
}

describe("x402 threat intel", () => {
  it("matches malicious providers by host", () => {
    const match = findMaliciousX402({
      url: "https://x402bridge.example/v1/bridge",
      host: "x402bridge.example",
      challenge: challenge(),
    });

    expect(match).toMatchObject({
      reputation: "malicious",
      rule: "threatIntel.host",
    });
  });

  it("matches blocked facilitators from the x402 challenge", () => {
    const match = findMaliciousX402({
      url: "https://provider.example/pay",
      host: "provider.example",
      challenge: challenge({
        extra: { facilitator: "https://facilitator.invalid/x402" },
      }),
    });

    expect(match).toMatchObject({
      reputation: "blocked",
      rule: "threatIntel.facilitator",
    });
  });

  it("returns undefined for unlisted x402 providers", () => {
    const match = findMaliciousX402({
      url: "https://x402.quicknode.com/rpc",
      host: "x402.quicknode.com",
      challenge: challenge(),
    });

    expect(match).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import { parseChallenge } from "./challenge.js";

describe("parseChallenge", () => {
  it("parses a USDC devnet challenge and converts amount to USD", () => {
    const body = {
      x402Version: 1,
      accepts: [
        {
          scheme: "exact",
          network: "solana-devnet",
          asset: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
          payTo: "abc",
          maxAmountRequired: "50000",
        },
      ],
    };
    const parsed = parseChallenge(body);
    expect(parsed.requirement.token).toBe("USDC");
    expect(parsed.requirement.amountUsd).toBeCloseTo(0.05, 6);
    expect(parsed.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("throws on invalid challenge body", () => {
    expect(() => parseChallenge({ accepts: [] })).toThrow();
  });

  it("throws on unknown asset", () => {
    expect(() =>
      parseChallenge({
        accepts: [
          {
            scheme: "exact",
            network: "solana-devnet",
            asset: "UNKNOWN_MINT_XXX",
            payTo: "abc",
            maxAmountRequired: "1",
          },
        ],
      }),
    ).toThrow();
  });
});

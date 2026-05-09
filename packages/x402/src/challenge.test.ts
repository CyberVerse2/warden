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

  it("defaults body challenges without an explicit version to x402 v2", () => {
    const parsed = parseChallenge({
      accepts: [
        {
          scheme: "exact",
          network: "solana-devnet",
          asset: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
          payTo: "abc",
          maxAmountRequired: "1",
        },
      ],
    });
    expect(parsed.x402Version).toBe(2);
  });

  it("parses v2 payment-required headers before the body", () => {
    const headerBody = {
      accepts: [
        {
          scheme: "exact",
          network: "solana-devnet",
          asset: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
          payTo: "header-recipient",
          maxAmountRequired: "25000",
        },
      ],
    };
    const parsed = parseChallenge(
      { accepts: [] },
      {},
      {
        "payment-required": Buffer.from(
          JSON.stringify(headerBody),
          "utf8",
        ).toString("base64"),
      },
    );

    expect(parsed.x402Version).toBe(2);
    expect(parsed.requirement.recipient).toBe("header-recipient");
    expect(parsed.requirement.amountUsd).toBeCloseTo(0.025, 6);
  });

  it("parses v1 x-payment-required headers", () => {
    const headerBody = {
      x402Version: 1,
      accepts: [
        {
          scheme: "exact",
          network: "solana-devnet",
          asset: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
          payTo: "v1-recipient",
          maxAmountRequired: "1000",
        },
      ],
    };
    const parsed = parseChallenge(
      { accepts: [] },
      {},
      {
        "x-payment-required": Buffer.from(
          JSON.stringify(headerBody),
          "utf8",
        ).toString("base64"),
      },
    );

    expect(parsed.x402Version).toBe(1);
    expect(parsed.requirement.recipient).toBe("v1-recipient");
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

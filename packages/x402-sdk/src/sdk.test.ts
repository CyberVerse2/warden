import { CELO_SEPOLIA_NETWORK } from "@warden/core";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  CELO_SEPOLIA_USDC,
  createWardenX402Sdk,
  usdToUsdcRaw,
} from "./sdk";
import type { PaidOperation } from "./types";

const echoOperation: PaidOperation<z.ZodObject<{ message: z.ZodString }>, { ok: true; message: string }> = {
  id: "ai.generateText",
  category: "ai",
  provider: "openai",
  method: "POST",
  path: "/ai/generate-text",
  description: "Echo text for tests.",
  price: { amountUsd: "0.012345" },
  input: z.object({ message: z.string() }),
  output: z.object({ ok: z.literal(true), message: z.string() }),
  async handler(input) {
    return { ok: true, message: input.message };
  },
};

describe("createWardenX402Sdk", () => {
  it("builds a Celo USDC manifest and x402 quote", () => {
    const sdk = createWardenX402Sdk({
      payTo: "0x1111111111111111111111111111111111111111",
      operations: [echoOperation],
    });

    expect(sdk.manifest()).toMatchObject({
      network: CELO_SEPOLIA_NETWORK,
      asset: CELO_SEPOLIA_USDC,
      payTo: "0x1111111111111111111111111111111111111111",
      operations: [
        {
          id: "ai.generateText",
          category: "ai",
          provider: "openai",
          price: { amountUsd: "0.012345" },
        },
      ],
    });

    expect(sdk.quote("ai.generateText").accepts[0]).toMatchObject({
      scheme: "exact",
      network: CELO_SEPOLIA_NETWORK,
      asset: CELO_SEPOLIA_USDC,
      amount: "12345",
      payTo: "0x1111111111111111111111111111111111111111",
      extra: {
        name: "USDC",
        version: "2",
        operationId: "ai.generateText",
        provider: "openai",
        category: "ai",
      },
    });
  });

  it("returns payment_required before verified execution", async () => {
    const sdk = createWardenX402Sdk({
      payTo: "0x1111111111111111111111111111111111111111",
      operations: [echoOperation],
    });

    await expect(
      sdk.execute({ operationId: "ai.generateText", input: { message: "hi" } }),
    ).resolves.toMatchObject({
      kind: "payment_required",
      quote: { operation: { id: "ai.generateText" } },
    });
  });

  it("executes after verifier approval and records a receipt", async () => {
    const sdk = createWardenX402Sdk({
      payTo: "0x1111111111111111111111111111111111111111",
      operations: [echoOperation],
      verifier: {
        async verify() {
          return {
            valid: true,
            payer: "0x2222222222222222222222222222222222222222",
            transaction: "0xabc",
          };
        },
      },
    });

    await expect(
      sdk.execute<{ ok: true; message: string }>({
        operationId: "ai.generateText",
        input: { message: "paid" },
        paymentHeader: "signed-payment",
      }),
    ).resolves.toMatchObject({
      kind: "executed",
      output: { ok: true, message: "paid" },
      receipt: {
        operationId: "ai.generateText",
        provider: "openai",
        amountUsd: "0.012345",
        payer: "0x2222222222222222222222222222222222222222",
        transaction: "0xabc",
      },
    });
  });
});

describe("usdToUsdcRaw", () => {
  it("converts decimal USD to six-decimal USDC raw units", () => {
    expect(usdToUsdcRaw("0.01")).toBe("10000");
    expect(usdToUsdcRaw("1")).toBe("1000000");
    expect(usdToUsdcRaw("12.345678")).toBe("12345678");
  });
});

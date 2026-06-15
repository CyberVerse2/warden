import { describe, expect, it } from "vitest";
import { z } from "zod";
import { handleWardenX402Request } from "./adapter";
import { createWardenX402Sdk } from "./sdk";
import type { PaidOperation } from "./types";

const paidEchoOperation: PaidOperation = {
  id: "ai.generateText",
  category: "ai",
  provider: "openai",
  method: "POST",
  path: "/ai/generate-text",
  description: "Echo text for adapter tests.",
  price: { amountUsd: "0.01" },
  input: z.object({ message: z.string() }),
  async handler(input) {
    const parsed = z.object({ message: z.string() }).parse(input);
    return { message: parsed.message };
  },
};

describe("handleWardenX402Request", () => {
  it("serves the SDK manifest", async () => {
    const sdk = createWardenX402Sdk({
      payTo: "0x1111111111111111111111111111111111111111",
      operations: [paidEchoOperation],
    });

    const response = await handleWardenX402Request(
      sdk,
      new Request("https://example.com/x402/manifest"),
    );
    await expect(response.json()).resolves.toMatchObject({
      operations: [{ id: "ai.generateText" }],
    });
  });

  it("returns a 402 quote for unpaid operation calls", async () => {
    const sdk = createWardenX402Sdk({
      payTo: "0x1111111111111111111111111111111111111111",
      operations: [paidEchoOperation],
    });

    const response = await handleWardenX402Request(
      sdk,
      new Request("https://example.com/x402/ai/generate-text", {
        method: "POST",
        body: JSON.stringify({ message: "hello" }),
      }),
    );

    expect(response.status).toBe(402);
    expect(response.headers.get("payment-required")).toBeTruthy();
    await expect(response.json()).resolves.toMatchObject({
      operation: { id: "ai.generateText" },
      accepts: [
        {
          resource: "https://example.com/x402/ai/generate-text",
          extra: {
            resource: "https://example.com/x402/ai/generate-text",
          },
        },
      ],
    });
  });

  it("rejects invalid operation input before returning a payment quote", async () => {
    const sdk = createWardenX402Sdk({
      payTo: "0x1111111111111111111111111111111111111111",
      operations: [paidEchoOperation],
    });

    const response = await handleWardenX402Request(
      sdk,
      new Request("https://example.com/x402/ai/generate-text", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("payment-required")).toBeNull();
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("message"),
    });
  });

  it("executes an operation after payment verification", async () => {
    const sdk = createWardenX402Sdk({
      payTo: "0x1111111111111111111111111111111111111111",
      operations: [paidEchoOperation],
      verifier: {
        async verify(input) {
          expect(input.requirements).toMatchObject({
            resource: "https://example.com/x402/ai/generate-text",
            extra: {
              resource: "https://example.com/x402/ai/generate-text",
            },
          });
          return { valid: true, transaction: "0xpaid" };
        },
      },
    });

    const response = await handleWardenX402Request(
      sdk,
      new Request("https://example.com/x402/ai/generate-text", {
        method: "POST",
        headers: { "payment-signature": "signed" },
        body: JSON.stringify({ message: "paid hello" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      output: { message: "paid hello" },
      receipt: {
        operationId: "ai.generateText",
        transaction: "0xpaid",
      },
    });
  });
});

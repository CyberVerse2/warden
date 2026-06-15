import { encodePaymentSignatureHeader } from "@x402/core/http";
import type { FacilitatorClient } from "@x402/core/server";
import { describe, expect, it, vi } from "vitest";
import { createFacilitatorPaymentVerifier } from "./verifier";
import type { PaymentVerifierInput } from "./types";

const paymentPayload = {
  x402Version: 2,
  accepted: {
    scheme: "exact",
    network: "eip155:11142220" as const,
    asset: "0x01C5C0122039549AD1493B8220cABEdD739BC44E",
    payTo: "0xed1AFc4DCfb39b9ab9d67f3f7f7d02803cEA9FC5",
    amount: "10000",
    maxTimeoutSeconds: 300,
    extra: {},
  },
  payload: {
    authorization: { from: "0x0000000000000000000000000000000000000001" },
  },
};

const verifierInput: PaymentVerifierInput = {
  paymentHeader: encodePaymentSignatureHeader(paymentPayload),
  requirements: paymentPayload.accepted,
  operation: {
    id: "ai.generateText",
    category: "ai",
    provider: "openai",
    method: "POST",
    path: "/ai/generate-text",
    description: "Generate text.",
    price: { amountUsd: "0.01" },
  },
};

describe("createFacilitatorPaymentVerifier", () => {
  it("verifies and settles payment headers with a facilitator", async () => {
    const facilitator = {
      verify: vi.fn(async () => ({ isValid: true, payer: "0xpayer" })),
      settle: vi.fn(async () => ({
        success: true,
        payer: "0xpayer",
        transaction: "0xtx",
        network: "eip155:11142220" as const,
      })),
      getSupported: vi.fn(),
    } satisfies FacilitatorClient;

    const verifier = createFacilitatorPaymentVerifier({
      facilitatorUrl: "https://facilitator.example",
      facilitator,
    });

    await expect(verifier.verify(verifierInput)).resolves.toEqual({
      valid: true,
      payer: "0xpayer",
      transaction: "0xtx",
    });
    expect(facilitator.verify).toHaveBeenCalledWith(
      paymentPayload,
      verifierInput.requirements,
    );
    expect(facilitator.settle).toHaveBeenCalledWith(
      paymentPayload,
      verifierInput.requirements,
    );
  });

  it("denies invalid facilitator verification responses", async () => {
    const facilitator = {
      verify: vi.fn(async () => ({
        isValid: false,
        invalidReason: "insufficient_funds",
      })),
      settle: vi.fn(),
      getSupported: vi.fn(),
    } satisfies FacilitatorClient;

    const verifier = createFacilitatorPaymentVerifier({
      facilitatorUrl: "https://facilitator.example",
      facilitator,
    });

    await expect(verifier.verify(verifierInput)).resolves.toEqual({
      valid: false,
      reason: "insufficient_funds",
    });
    expect(facilitator.settle).not.toHaveBeenCalled();
  });
});

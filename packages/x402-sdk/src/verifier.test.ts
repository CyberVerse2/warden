import { encodePaymentSignatureHeader } from "@x402/core/http";
import type { FacilitatorClient } from "@x402/core/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFacilitatorPaymentVerifier,
  createThirdwebPaymentVerifier,
} from "./verifier";
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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

describe("createThirdwebPaymentVerifier", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("settles payment headers through the thirdweb x402 facilitator", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.paymentPayload).toMatchObject({
        x402Version: 2,
        scheme: "exact",
        network: "eip155:11142220",
      });
      expect(body.paymentRequirements).toMatchObject({
        ...verifierInput.requirements,
        maxAmountRequired: verifierInput.requirements.amount,
      });
      return Response.json({
        success: true,
        payer: "0xpayer",
        transaction: "0xtx",
        network: "eip155:11142220",
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const verifier = createThirdwebPaymentVerifier({
      secretKey: "thirdweb-secret-key",
      serverWalletAddress: "0xed1AFc4DCfb39b9ab9d67f3f7f7d02803cEA9FC5",
    });

    await expect(verifier.verify(verifierInput)).resolves.toEqual({
      valid: true,
      payer: "0xpayer",
      transaction: "0xtx",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.thirdweb.com/v1/payments/x402/settle",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-secret-key": "thirdweb-secret-key",
        }),
      }),
    );
  });

  it("denies thirdweb settlement failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          success: false,
          errorReason: "insufficient_funds",
          payer: "0xpayer",
          transaction: "",
          network: "eip155:11142220",
        }),
      ),
    );

    const verifier = createThirdwebPaymentVerifier({
      secretKey: "thirdweb-secret-key",
      serverWalletAddress: "0xed1AFc4DCfb39b9ab9d67f3f7f7d02803cEA9FC5",
    });

    await expect(verifier.verify(verifierInput)).resolves.toEqual({
      valid: false,
      payer: "0xpayer",
      reason: "insufficient_funds",
    });
  });
});

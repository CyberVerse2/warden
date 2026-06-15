import { decodePaymentSignatureHeader } from "@x402/core/http";
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import { HTTPFacilitatorClient, type FacilitatorClient } from "@x402/core/server";
import type { PaymentVerifier } from "./types";

export interface FacilitatorPaymentVerifierOptions {
  facilitatorUrl: string;
  facilitator?: FacilitatorClient;
}

export function createFacilitatorPaymentVerifier(
  options: FacilitatorPaymentVerifierOptions,
): PaymentVerifier {
  const facilitator =
    options.facilitator ??
    new HTTPFacilitatorClient({ url: options.facilitatorUrl });

  return {
    async verify({ paymentHeader, requirements }) {
      const paymentPayload = decodePaymentSignatureHeader(paymentHeader);
      const verify = await facilitator.verify(paymentPayload, requirements);
      if (!verify.isValid) {
        return {
          valid: false,
          reason:
            verify.invalidMessage ??
            verify.invalidReason ??
            "Payment verification failed",
        };
      }

      const settle = await facilitator.settle(paymentPayload, requirements);
      if (!settle.success) {
        return {
          valid: false,
          reason:
            settle.errorMessage ??
            settle.errorReason ??
            "Payment settlement failed",
        };
      }

      return {
        valid: true,
        ...(settle.payer ?? verify.payer
          ? { payer: settle.payer ?? verify.payer }
          : {}),
        transaction: settle.transaction,
      };
    },
  };
}

export type {
  FacilitatorClient,
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
};

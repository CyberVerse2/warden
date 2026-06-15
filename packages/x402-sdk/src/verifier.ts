import { decodePaymentSignatureHeader } from "@x402/core/http";
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import { HTTPFacilitatorClient, type FacilitatorClient } from "@x402/core/server";
import { createThirdwebClient } from "thirdweb";
import {
  facilitator as createThirdwebFacilitator,
  type WaitUntil,
} from "thirdweb/x402";
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

export interface ThirdwebPaymentVerifierOptions {
  secretKey: string;
  serverWalletAddress: string;
  vaultAccessToken?: string | undefined;
  waitUntil?: WaitUntil;
  baseUrl?: string | undefined;
}

export function createThirdwebPaymentVerifier(
  options: ThirdwebPaymentVerifierOptions,
): PaymentVerifier {
  const client = createThirdwebClient({ secretKey: options.secretKey });
  const facilitator = createThirdwebFacilitator({
    client,
    serverWalletAddress: options.serverWalletAddress,
    waitUntil: options.waitUntil ?? "submitted",
    ...(options.vaultAccessToken
      ? { vaultAccessToken: options.vaultAccessToken }
      : {}),
    ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
  });

  return {
    async verify({ paymentHeader, requirements }) {
      let paymentPayload: PaymentPayload;
      try {
        paymentPayload = decodePaymentSignatureHeader(paymentHeader);
      } catch (error) {
        return {
          valid: false,
          reason: `Invalid payment header: ${errorMessage(error)}`,
        };
      }

      try {
        const thirdwebPayload = toThirdwebPaymentPayload(
          paymentPayload,
          requirements,
        );
        const thirdwebRequirements = toThirdwebPaymentRequirements(requirements);
        const settle = await facilitator.settle(
          thirdwebPayload as never,
          thirdwebRequirements as never,
          options.waitUntil,
        );
        if (!settle.success) {
          return {
            valid: false,
            ...(settle.payer ? { payer: settle.payer } : {}),
            reason:
              settle.errorMessage ??
              settle.errorReason ??
              "Payment settlement failed",
          };
        }

        return {
          valid: true,
          ...(settle.payer ? { payer: settle.payer } : {}),
          transaction: settle.transaction,
        };
      } catch (error) {
        return {
          valid: false,
          reason: `Payment settlement failed: ${errorMessage(error)}`,
        };
      }
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toThirdwebPaymentPayload(
  paymentPayload: PaymentPayload,
  requirements: PaymentRequirements,
): Record<string, unknown> {
  const source = paymentPayload as unknown as Record<string, unknown>;
  const accepted =
    source["accepted"] && typeof source["accepted"] === "object"
      ? (source["accepted"] as Record<string, unknown>)
      : {};

  return {
    ...source,
    scheme:
      stringField(source["scheme"]) ??
      stringField(accepted["scheme"]) ??
      requirements.scheme,
    network:
      stringField(source["network"]) ??
      stringField(accepted["network"]) ??
      requirements.network,
  };
}

function toThirdwebPaymentRequirements(
  requirements: PaymentRequirements,
): Record<string, unknown> {
  const source = requirements as unknown as Record<string, unknown>;
  const extra =
    requirements.extra && typeof requirements.extra === "object"
      ? (requirements.extra as Record<string, unknown>)
      : {};
  const resource =
    stringField(source["resource"]) ?? stringField(extra["resource"]);
  const description =
    stringField(source["description"]) ?? stringField(extra["description"]);
  const mimeType =
    stringField(source["mimeType"]) ?? stringField(extra["mimeType"]);

  return {
    ...requirements,
    maxAmountRequired: requirements.amount,
    ...(resource ? { resource } : {}),
    ...(description ? { description } : {}),
    ...(mimeType ? { mimeType } : {}),
  };
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export type {
  FacilitatorClient,
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
};

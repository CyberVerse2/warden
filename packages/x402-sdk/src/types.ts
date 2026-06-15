import type { CELO_MAINNET_NETWORK, CELO_SEPOLIA_NETWORK } from "@warden/core";
import type { PaymentRequirements } from "@x402/core/types";
import type { z } from "zod";

export type CeloNetwork =
  | typeof CELO_MAINNET_NETWORK
  | typeof CELO_SEPOLIA_NETWORK;

export type FetchLike = typeof fetch;

export type OperationCategory =
  | "ai"
  | "media"
  | "audio"
  | "search"
  | "crypto"
  | "messaging";

export interface OperationPrice {
  amountUsd: string;
}

export interface PaidOperationContext {
  fetch: FetchLike;
  operationId: string;
}

export interface PaidOperation<
  InputSchema extends z.ZodType = z.ZodTypeAny,
  Output = unknown,
> {
  id: string;
  category: OperationCategory;
  provider: "openai" | "fal" | "fish" | "tavily" | "exa" | "alchemy" | "resend";
  method: "GET" | "POST";
  path: string;
  description: string;
  price: OperationPrice;
  input: InputSchema;
  output?: z.ZodType<Output>;
  handler(input: z.output<InputSchema>, context: PaidOperationContext): Promise<Output>;
}

export interface OperationManifestEntry {
  id: string;
  category: OperationCategory;
  provider: PaidOperation["provider"];
  method: PaidOperation["method"];
  path: string;
  description: string;
  price: OperationPrice;
}

export interface X402SdkManifest {
  network: CeloNetwork;
  asset: string;
  payTo: string;
  operations: OperationManifestEntry[];
}

export interface PaymentQuote {
  x402Version: 2;
  operation: OperationManifestEntry;
  accepts: PaymentRequirements[];
}

export interface PaymentVerifierInput {
  paymentHeader: string;
  requirements: PaymentRequirements;
  operation: OperationManifestEntry;
}

export interface PaymentVerification {
  valid: boolean;
  payer?: string;
  transaction?: string;
  reason?: string;
}

export interface PaymentVerifier {
  verify(input: PaymentVerifierInput): Promise<PaymentVerification>;
}

export type ExecutePaidOperationResult<Output = unknown> =
  | {
      kind: "invalid_input";
      reason: string;
    }
  | {
      kind: "payment_required";
      quote: PaymentQuote;
    }
  | {
      kind: "denied";
      reason: string;
    }
  | {
      kind: "executed";
      output: Output;
      receipt: {
        operationId: string;
        provider: PaidOperation["provider"];
        amountUsd: string;
        network: CeloNetwork;
        asset: string;
        payer?: string;
        transaction?: string;
      };
    };

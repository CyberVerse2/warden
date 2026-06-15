import { CELO_SEPOLIA_NETWORK } from "@warden/core";
import type { PaymentRequirements } from "@x402/core/types";
import {
  type CeloNetwork,
  type ExecutePaidOperationResult,
  type FetchLike,
  type OperationManifestEntry,
  type PaidOperation,
  type PaymentQuote,
  type PaymentVerifier,
  type X402SdkManifest,
} from "./types";

export const CELO_USDC = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C";
export const CELO_SEPOLIA_USDC =
  "0x01C5C0122039549AD1493B8220cABEdD739BC44E";

export interface CreateWardenX402SdkOptions {
  network?: CeloNetwork;
  asset?: string;
  payTo: string;
  facilitatorUrl?: string | undefined;
  maxTimeoutSeconds?: number | undefined;
  fetch?: FetchLike | undefined;
  verifier?: PaymentVerifier | undefined;
  operations?: PaidOperation[];
}

export interface ExecutePaidOperationInput {
  operationId: string;
  input: unknown;
  paymentHeader?: string | undefined;
  resourceUrl?: string | undefined;
}

export interface WardenX402Sdk {
  register(operation: PaidOperation): WardenX402Sdk;
  quote(operationId: string): PaymentQuote;
  manifest(): X402SdkManifest;
  operation(operationId: string): PaidOperation;
  execute<Output = unknown>(
    input: ExecutePaidOperationInput,
  ): Promise<ExecutePaidOperationResult<Output>>;
}

export function createWardenX402Sdk(
  options: CreateWardenX402SdkOptions,
): WardenX402Sdk {
  const network = options.network ?? CELO_SEPOLIA_NETWORK;
  const asset =
    options.asset ?? (network === CELO_SEPOLIA_NETWORK ? CELO_SEPOLIA_USDC : CELO_USDC);
  const fetchImpl = options.fetch ?? fetch;
  const operations = new Map<string, PaidOperation>();

  const sdk: WardenX402Sdk = {
    register(operation) {
      if (operations.has(operation.id)) {
        throw new Error(`Paid operation ${operation.id} is already registered`);
      }
      operations.set(operation.id, operation);
      return sdk;
    },

    quote(operationId) {
      const operation = sdk.operation(operationId);
      return {
        x402Version: 2,
        operation: manifestEntry(operation),
        accepts: [paymentRequirement(operation, options, network, asset)],
      };
    },

    manifest() {
      return {
        network,
        asset,
        payTo: options.payTo,
        operations: Array.from(operations.values()).map(manifestEntry),
      };
    },

    operation(operationId) {
      const operation = operations.get(operationId);
      if (!operation) throw new Error(`Unknown paid operation ${operationId}`);
      return operation;
    },

    async execute<Output = unknown>({
      operationId,
      input,
      paymentHeader,
      resourceUrl,
    }: ExecutePaidOperationInput): Promise<ExecutePaidOperationResult<Output>> {
      const operation = sdk.operation(operationId);
      const quote = quoteWithResource(sdk.quote(operationId), resourceUrl);
      if (!paymentHeader) {
        return { kind: "payment_required", quote };
      }
      if (!options.verifier) {
        return {
          kind: "denied",
          reason: "No payment verifier configured for paid operation execution",
        };
      }

      const verification = await options.verifier.verify({
        paymentHeader,
        requirements: quote.accepts[0]!,
        operation: quote.operation,
      });
      if (!verification.valid) {
        return {
          kind: "denied",
          reason: verification.reason ?? "Payment verification failed",
        };
      }

      const parsedInput = operation.input.parse(input);
      const output = await operation.handler(parsedInput, {
        fetch: fetchImpl,
        operationId,
      });
      const parsedOutput = (
        operation.output ? operation.output.parse(output) : output
      ) as Output;

      return {
        kind: "executed",
        output: parsedOutput,
        receipt: {
          operationId,
          provider: operation.provider,
          amountUsd: operation.price.amountUsd,
          network,
          asset,
          ...(verification.payer ? { payer: verification.payer } : {}),
          ...(verification.transaction
            ? { transaction: verification.transaction }
            : {}),
        },
      };
    },
  };

  for (const operation of options.operations ?? []) {
    sdk.register(operation);
  }

  return sdk;
}

function paymentRequirement(
  operation: PaidOperation,
  options: CreateWardenX402SdkOptions,
  network: CeloNetwork,
  asset: string,
): PaymentRequirements {
  const rawAmount = usdToUsdcRaw(operation.price.amountUsd);
  return {
    scheme: "exact",
    network,
    asset,
    payTo: options.payTo,
    amount: rawAmount,
    maxTimeoutSeconds: options.maxTimeoutSeconds ?? 300,
    extra: {
      name: "USDC",
      version: "2",
      operationId: operation.id,
      resource: operation.path,
      description: operation.description,
      mimeType: "application/json",
      provider: operation.provider,
      category: operation.category,
      priceUsd: operation.price.amountUsd,
      ...(options.facilitatorUrl ? { facilitator: options.facilitatorUrl } : {}),
    },
  };
}

function manifestEntry(operation: PaidOperation): OperationManifestEntry {
  return {
    id: operation.id,
    category: operation.category,
    provider: operation.provider,
    method: operation.method,
    path: operation.path,
    description: operation.description,
    price: operation.price,
  };
}

function quoteWithResource(
  quote: PaymentQuote,
  resourceUrl: string | undefined,
): PaymentQuote {
  if (!resourceUrl) return quote;
  return {
    ...quote,
    accepts: quote.accepts.map((requirement) =>
      paymentRequirementWithResource(requirement, resourceUrl),
    ),
  };
}

function paymentRequirementWithResource(
  requirement: PaymentRequirements,
  resourceUrl: string,
): PaymentRequirements {
  return {
    ...requirement,
    resource: resourceUrl,
    extra: {
      ...(requirement.extra ?? {}),
      resource: resourceUrl,
    },
  } as PaymentRequirements;
}

export function usdToUsdcRaw(amountUsd: string): string {
  const trimmed = amountUsd.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) {
    throw new Error(`Invalid USD amount for USDC payment: ${amountUsd}`);
  }
  const [whole = "0", fraction = ""] = trimmed.split(".");
  return `${whole}${fraction.padEnd(6, "0")}`.replace(/^0+(?=\d)/, "");
}

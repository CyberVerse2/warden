import { createHash } from "node:crypto";
import { CELO_MAINNET_NETWORK, type PaymentProof } from "@warden/core";
import type { WalletService } from "@warden/wallet";
import { encodePaymentSignatureHeader } from "@x402/core/http";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { ExactEvmScheme, type ClientEvmSigner } from "@x402/evm";
import type { ParsedChallenge } from "./challenge";

export interface ProofBuilder {
  build(args: {
    walletId: string;
    challenge: ParsedChallenge;
    requestHash: string;
  }): Promise<PaymentProof>;
}

export interface X402EvmProofBuilderOptions {
  rpcUrl?: string;
  rpcUrls?: {
    mainnet?: string | undefined;
    sepolia?: string | undefined;
  };
}

export function createX402EvmProofBuilder(
  walletService: WalletService,
  opts: X402EvmProofBuilderOptions,
): ProofBuilder {
  return {
    async build({ walletId, challenge }) {
      if (challenge.requirement.token !== "USDC") {
        throw new Error("x402 EVM builder only supports USDC");
      }

      const signer = await createWalletServiceEvmSigner(walletService, walletId);
      const scheme = new ExactEvmScheme(signer, {
        rpcUrl: selectRpcUrl(challenge.raw.network, opts),
      });
      const x402Version = challenge.x402Version === 1 ? 1 : 2;
      const paymentRequirements = toSdkPaymentRequirements(challenge);
      const paymentPayload = (await scheme.createPaymentPayload(
        x402Version,
        paymentRequirements,
      )) as PaymentPayload;
      const headerJson = JSON.stringify(paymentPayload);

      return {
        header:
          x402Version === 1
            ? Buffer.from(headerJson, "utf8").toString("base64")
            : encodePaymentSignatureHeader(paymentPayload),
        headerName: x402Version === 1 ? "X-PAYMENT" : "PAYMENT-SIGNATURE",
        proofHash: createHash("sha256").update(headerJson).digest("hex"),
      };
    },
  };
}

async function createWalletServiceEvmSigner(
  walletService: WalletService,
  walletId: string,
): Promise<ClientEvmSigner> {
  const publicKey = await walletService.getPublicKey(walletId);
  if (!publicKey.startsWith("0x")) {
    throw new Error("wallet_address_not_evm");
  }
  const address = publicKey as `0x${string}`;
  return {
    address,
    async signTypedData(message) {
      const signed = await walletService.signTypedData(walletId, message);
      return signed.signature;
    },
  };
}

function selectRpcUrl(
  network: string,
  opts: X402EvmProofBuilderOptions,
): string | undefined {
  if (network === CELO_MAINNET_NETWORK || network === "celo-mainnet") {
    return opts.rpcUrls?.mainnet ?? opts.rpcUrl;
  }
  return opts.rpcUrls?.sepolia ?? opts.rpcUrl;
}

function toSdkPaymentRequirements(
  challenge: ParsedChallenge,
): PaymentRequirements {
  return {
    scheme: challenge.raw.scheme,
    network: challenge.raw.network as `${string}:${string}`,
    asset: challenge.raw.asset,
    amount: challenge.requirement.amountRaw,
    payTo: challenge.raw.payTo,
    maxTimeoutSeconds: challenge.raw.maxTimeoutSeconds ?? 300,
    extra: challenge.raw.extra ?? {},
  };
}

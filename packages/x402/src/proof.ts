import { createHash } from "node:crypto";
import type { PaymentProof } from "@warden/core";
import type { WalletService } from "@warden/wallet";
import { ExactSvmScheme, type ClientSvmSigner } from "@x402/svm";
import { ExactSvmSchemeV1 } from "@x402/svm/exact/v1/client";
import { encodePaymentSignatureHeader } from "@x402/core/http";
import { address, type SignatureBytes } from "@solana/kit";
import type { ParsedChallenge } from "./challenge";

export interface ProofBuilder {
  build(args: {
    walletId: string;
    challenge: ParsedChallenge;
    requestHash: string;
  }): Promise<PaymentProof>;
}

const SOLANA_DEVNET_CAIP = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";
const SOLANA_MAINNET_CAIP = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export interface X402SvmProofBuilderOptions {
  rpcUrl: string;
}

/**
 * Pay.sh-compatible x402 exact on Solana. This delegates payment payload
 * construction to the official x402 SVM SDK and keeps Warden focused on
 * policy, custody, signing, and receipts.
 */
export function createX402SvmProofBuilder(
  walletService: WalletService,
  opts: X402SvmProofBuilderOptions,
): ProofBuilder {
  return {
    async build({ walletId, challenge }) {
      if (challenge.requirement.token !== "USDC") {
        throw new Error("x402 SVM builder only supports USDC");
      }

      return buildSdkExactPaymentProof({
        walletId,
        walletService,
        challenge,
        rpcUrl: opts.rpcUrl,
      });
    },
  };
}

async function buildSdkExactPaymentProof({
  walletId,
  walletService,
  challenge,
  rpcUrl,
}: {
  walletId: string;
  walletService: WalletService;
  challenge: ParsedChallenge;
  rpcUrl: string;
}): Promise<PaymentProof> {
  const signer = await createWalletServiceSvmSigner(walletService, walletId);
  const paymentRequirements = toSdkPaymentRequirements(challenge);
  const x402Version = challenge.x402Version === 1 ? 1 : 2;
  const scheme =
    x402Version === 1
      ? new ExactSvmSchemeV1(signer, { rpcUrl })
      : new ExactSvmScheme(signer, { rpcUrl });
  const sdkPayload = await scheme.createPaymentPayload(
    x402Version,
    paymentRequirements,
  );
  const paymentPayload =
    x402Version === 1
      ? sdkPayload
      : {
          ...sdkPayload,
          accepted: paymentRequirements,
        };
  const headerJson = JSON.stringify(paymentPayload);
  const extraHeaders = await buildSiwxHeaders({
    walletId,
    walletService,
    challenge,
  });

  return {
    header:
      x402Version === 1
        ? Buffer.from(headerJson, "utf8").toString("base64")
        : encodePaymentSignatureHeader(paymentPayload as Parameters<
            typeof encodePaymentSignatureHeader
          >[0]),
    headerName: x402Version === 1 ? "X-PAYMENT" : "PAYMENT-SIGNATURE",
    ...(Object.keys(extraHeaders).length > 0 ? { extraHeaders } : {}),
    proofHash: createHash("sha256").update(headerJson).digest("hex"),
  };
}

async function createWalletServiceSvmSigner(
  walletService: WalletService,
  walletId: string,
): Promise<ClientSvmSigner> {
  const publicKey = address(await walletService.getPublicKey(walletId));
  return {
    address: publicKey,
    async signTransactions(transactions) {
      return Promise.all(
        transactions.map(async (transaction) => {
          const signed = await walletService.signMessage(
            walletId,
            Uint8Array.from(transaction.messageBytes),
          );
          return {
            [publicKey]: signed.signature as SignatureBytes,
          };
        }),
      );
    },
  };
}

function toSdkPaymentRequirements(challenge: ParsedChallenge) {
  if (
    challenge.x402Version >= 2 &&
    typeof challenge.raw.extra?.feePayer !== "string"
  ) {
    throw new Error(
      "x402 SVM exact challenge is missing extra.feePayer; provider is not compatible with the Pay.sh x402 SDK path",
    );
  }

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

interface SiwxExtension {
  domain: string;
  uri: string;
  statement?: string;
  version: string;
  nonce: string;
  issuedAt: string;
  expirationTime?: string;
  notBefore?: string;
  requestId?: string;
  resources?: string[];
  supportedChains: Array<{
    chainId: string;
    type: string;
    signatureScheme?: string;
  }>;
}

async function buildSiwxHeaders({
  walletId,
  walletService,
  challenge,
}: {
  walletId: string;
  walletService: WalletService;
  challenge: ParsedChallenge;
}): Promise<Record<string, string>> {
  const extension = parseSiwxExtension(challenge.siwx);
  if (!extension) return {};

  const chain = selectSiwxChain(extension, challenge.raw.network);
  const publicKey = await walletService.getPublicKey(walletId);
  const payloadWithoutSignature = {
    domain: extension.domain,
    address: publicKey,
    uri: extension.uri,
    ...(extension.statement !== undefined ? { statement: extension.statement } : {}),
    version: extension.version,
    chainId: chain.chainId,
    nonce: extension.nonce,
    issuedAt: extension.issuedAt,
    ...(extension.expirationTime !== undefined
      ? { expirationTime: extension.expirationTime }
      : {}),
    ...(extension.notBefore !== undefined ? { notBefore: extension.notBefore } : {}),
    ...(extension.requestId !== undefined ? { requestId: extension.requestId } : {}),
    ...(extension.resources !== undefined ? { resources: extension.resources } : {}),
    type: chain.type,
    ...(chain.signatureScheme !== undefined
      ? { signatureScheme: chain.signatureScheme }
      : {}),
  };
  const message = formatSiwsMessage(payloadWithoutSignature);
  const signed = await walletService.signMessage(
    walletId,
    new TextEncoder().encode(message),
  );
  const payload = {
    ...payloadWithoutSignature,
    signature: base58Encode(signed.signature),
  };

  return {
    "SIGN-IN-WITH-X": Buffer.from(JSON.stringify(payload), "utf8").toString(
      "base64",
    ),
  };
}

function parseSiwxExtension(value: unknown): SiwxExtension | undefined {
  if (!isRecord(value)) return undefined;
  const info = isRecord(value.info) ? value.info : value;
  const supportedChains = value.supportedChains;
  if (!Array.isArray(supportedChains)) return undefined;
  const domain = stringField(info, "domain");
  const uri = stringField(info, "uri");
  const version = stringField(info, "version");
  const nonce = stringField(info, "nonce");
  const issuedAt = stringField(info, "issuedAt");
  if (!domain || !uri || !version || !nonce || !issuedAt) return undefined;

  return {
    domain,
    uri,
    ...(stringField(info, "statement") !== undefined
      ? { statement: stringField(info, "statement")! }
      : {}),
    version,
    nonce,
    issuedAt,
    ...(stringField(info, "expirationTime") !== undefined
      ? { expirationTime: stringField(info, "expirationTime")! }
      : {}),
    ...(stringField(info, "notBefore") !== undefined
      ? { notBefore: stringField(info, "notBefore")! }
      : {}),
    ...(stringField(info, "requestId") !== undefined
      ? { requestId: stringField(info, "requestId")! }
      : {}),
    ...(Array.isArray(info.resources)
      ? { resources: info.resources.map(String) }
      : {}),
    supportedChains: supportedChains
      .filter(isRecord)
      .flatMap((chain) => {
        const chainId = stringField(chain, "chainId");
        const type = stringField(chain, "type");
        const signatureScheme = stringField(chain, "signatureScheme");
        if (!chainId || type !== "ed25519") return [];
        if (signatureScheme !== undefined && signatureScheme !== "siws") return [];
        return [
          {
            chainId,
            type,
            ...(signatureScheme !== undefined ? { signatureScheme } : {}),
          },
        ];
      }),
  };
}

function selectSiwxChain(extension: SiwxExtension, preferredNetwork: string) {
  const preferred = normalizeSiwxChainId(preferredNetwork);
  const compatible = extension.supportedChains.filter(
    (chain) =>
      chain.chainId.startsWith("solana:") &&
      chain.type === "ed25519" &&
      (chain.signatureScheme === undefined || chain.signatureScheme === "siws"),
  );
  const selected =
    compatible.find((chain) => chain.chainId === preferred) ?? compatible[0];
  if (!selected) {
    throw new Error("siwx_no_compatible_solana_chain");
  }
  return selected;
}

function normalizeSiwxChainId(network: string): string {
  switch (network) {
    case "solana-devnet":
    case "devnet":
    case "localnet":
      return SOLANA_DEVNET_CAIP;
    case "solana-mainnet":
    case "mainnet":
    case "mainnet-beta":
    case "solana":
      return SOLANA_MAINNET_CAIP;
    default:
      return network;
  }
}

function formatSiwsMessage(info: {
  domain: string;
  address: string;
  uri: string;
  statement?: string;
  version: string;
  chainId: string;
  nonce: string;
  issuedAt: string;
  expirationTime?: string;
  notBefore?: string;
  requestId?: string;
  resources?: string[];
}) {
  const chainReference = info.chainId.startsWith("solana:")
    ? info.chainId.slice("solana:".length)
    : info.chainId;
  const lines = [
    `${info.domain} wants you to sign in with your Solana account:`,
    info.address,
    "",
  ];
  if (info.statement) {
    lines.push(info.statement, "");
  }
  lines.push(
    `URI: ${info.uri}`,
    `Version: ${info.version}`,
    `Chain ID: ${chainReference}`,
    `Nonce: ${info.nonce}`,
    `Issued At: ${info.issuedAt}`,
  );
  if (info.expirationTime) lines.push(`Expiration Time: ${info.expirationTime}`);
  if (info.notBefore) lines.push(`Not Before: ${info.notBefore}`);
  if (info.requestId) lines.push(`Request ID: ${info.requestId}`);
  if (info.resources?.length) {
    lines.push("Resources:");
    for (const resource of info.resources) lines.push(`- ${resource}`);
  }
  return lines.join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringField(value: Record<string, unknown>, field: string) {
  return typeof value[field] === "string" ? value[field] : undefined;
}

function base58Encode(bytes: Uint8Array): string {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) + BigInt(byte);
  let encoded = "";
  while (value > 0n) {
    const mod = Number(value % 58n);
    encoded = BASE58_ALPHABET[mod] + encoded;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    encoded = BASE58_ALPHABET[0] + encoded;
  }
  return encoded || BASE58_ALPHABET[0]!;
}

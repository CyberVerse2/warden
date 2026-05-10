import { createHash } from "node:crypto";
import type { PaymentProof } from "@warden/core";
import { WardenError, type ChallengeRequirement } from "@warden/core";
import type { WalletService } from "@warden/wallet";
import { Mppx, solana } from "@solana/mpp/client";
import { address, type SignatureBytes, type TransactionSigner } from "@solana/kit";
import {
  ComputeBudgetProgram,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import {
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

const USDC_MAINNET_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDC_DEVNET_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const USDC_DEVNET_LEGACY_MINT = "8UAFd3yrj6XRNKDcSKAt4smgUfxXTTDZmXaM2y61MAC3";
const USDC_DEVNET_SPL_MINT = "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr";

export interface ParsedMppChallenge {
  requirement: ChallengeRequirement;
  raw: unknown;
  hash: string;
}

export interface MppProofBuilderOptions {
  rpcUrls?: {
    mainnet?: string | undefined;
    devnet?: string | undefined;
    testnet?: string | undefined;
  };
}

export interface MppProofBuilder {
  build(args: {
    walletId: string;
    challenge: ParsedMppChallenge;
    response: Response;
  }): Promise<PaymentProof>;
}

export function parseMppChallenge(
  headers: Record<string, string>,
  opts: {
    allowedNetworks?: ChallengeRequirement["network"][];
    allowedTokens?: ChallengeRequirement["token"][];
  } = {},
): ParsedMppChallenge | undefined {
  const response = mppResponseFromHeaders(headers);
  const mppx = createMppClient(dummySigner(), {});
  let challenges: unknown[];
  try {
    challenges = mppx.transport.getChallenges?.(response) ?? [
      mppx.transport.getChallenge(response),
    ];
  } catch {
    return undefined;
  }

  for (const challenge of challenges) {
    const parsed = normalizeMppChallenge(challenge);
    if (!parsed) continue;
    if (
      opts.allowedNetworks?.length &&
      !opts.allowedNetworks.includes(parsed.requirement.network)
    ) {
      continue;
    }
    if (
      opts.allowedTokens?.length &&
      !opts.allowedTokens.includes(parsed.requirement.token)
    ) {
      continue;
    }
    return parsed;
  }

  return undefined;
}

export function mppResponseFromHeaders(headers: Record<string, string>): Response {
  const responseHeaders = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    responseHeaders.set(key, value);
  }
  return new Response(null, {
    status: 402,
    headers: responseHeaders,
  });
}

export function mppResponseFromChallenge(challenge: ParsedMppChallenge): Response {
  return new Response(null, {
    status: 402,
    headers: {
      "www-authenticate": serializeMppChallenge(challenge.raw),
    },
  });
}

export function createMppProofBuilder(
  walletService: WalletService,
  opts: MppProofBuilderOptions = {},
): MppProofBuilder {
  return {
    async build({ walletId, challenge, response }) {
      const legacyCredential = await maybeBuildLegacyServerFeePayerCredential(
        walletService,
        walletId,
        challenge,
      );
      if (legacyCredential) {
        return {
          header: legacyCredential,
          headerName: "Authorization",
          proofHash: createHash("sha256").update(legacyCredential).digest("hex"),
        };
      }

      const signer = await createWalletTransactionSigner(walletService, walletId);
      const mppx = createMppClient(signer, opts);
      const credential = await mppx.createCredential(response);
      return {
        header: credential,
        headerName: "Authorization",
        proofHash: createHash("sha256").update(credential).digest("hex"),
      };
    },
  };
}

async function maybeBuildLegacyServerFeePayerCredential(
  walletService: WalletService,
  walletId: string,
  challenge: ParsedMppChallenge,
): Promise<string | undefined> {
  if (!isRecord(challenge.raw)) return undefined;
  const request = challenge.raw.request;
  if (!isRecord(request)) return undefined;
  const methodDetails = isRecord(request.methodDetails) ? request.methodDetails : {};
  if (methodDetails.feePayer !== true) return undefined;

  const feePayerKey = stringField(methodDetails, "feePayerKey");
  const recentBlockhash = stringField(methodDetails, "recentBlockhash");
  const currency = stringField(request, "currency");
  const recipient = stringField(request, "recipient");
  const amountRaw = stringField(request, "amount");
  if (!feePayerKey || !recentBlockhash || !currency || !recipient || !amountRaw) {
    return undefined;
  }

  const amount = BigInt(amountRaw);
  const decimals = numberField(methodDetails, "decimals") ?? 6;
  const walletPublicKey = new PublicKey(await walletService.getPublicKey(walletId));
  const feePayer = new PublicKey(feePayerKey);
  const recipientOwner = new PublicKey(recipient);
  const transaction = new Transaction({
    feePayer,
    recentBlockhash,
  });

  transaction.add(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1n }),
    ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
  );

  if (currency === "sol" || currency === "11111111111111111111111111111111") {
    return undefined;
  }

  const mint = new PublicKey(currency);
  const tokenProgram = new PublicKey(
    stringField(methodDetails, "tokenProgram") ?? TOKEN_PROGRAM_ID.toBase58(),
  );
  const sourceAta = getAssociatedTokenAddressSync(
    mint,
    walletPublicKey,
    false,
    tokenProgram,
  );
  const destinationAta = getAssociatedTokenAddressSync(
    mint,
    recipientOwner,
    false,
    tokenProgram,
  );

  transaction.add(
    createTransferCheckedInstruction(
      sourceAta,
      mint,
      destinationAta,
      walletPublicKey,
      amount,
      decimals,
      [],
      tokenProgram,
    ),
  );

  const signed = await walletService.signTransaction(walletId, transaction, {
    requireAllSignatures: false,
    verifySignatures: false,
  });
  return serializeMppCredential(challenge.raw, {
    transaction: signed.transactionBase64,
    type: "transaction",
  });
}

function createMppClient(signer: TransactionSigner, opts: MppProofBuilderOptions) {
  void opts;
  return Mppx.create({
    methods: [
      solana.charge({
        signer,
      }),
    ],
    polyfill: false,
  });
}

function normalizeMppChallenge(challenge: unknown): ParsedMppChallenge | undefined {
  if (!isRecord(challenge)) return undefined;
  if (challenge.method !== "solana" || challenge.intent !== "charge") return undefined;
  const request = challenge.request;
  if (!isRecord(request)) return undefined;
  const methodDetails = isRecord(request.methodDetails) ? request.methodDetails : {};
  const network = classifyMppNetwork(stringField(methodDetails, "network") ?? "mainnet");
  const currency = stringField(request, "currency");
  const token = currency ? classifyMppToken(currency) : undefined;
  const amountRaw = stringField(request, "amount");
  const recipient = stringField(request, "recipient");
  if (!network || !token || !amountRaw || !recipient) return undefined;

  const decimals = numberField(methodDetails, "decimals") ?? (token === "USDC" ? 6 : 9);
  const amountUsd = Number(amountRaw) / 10 ** decimals;
  const hash = createHash("sha256").update(JSON.stringify(challenge)).digest("hex");
  return {
    requirement: {
      network,
      token,
      recipient,
      amountRaw,
      amountUsd,
      nonce: stringField(challenge, "id") ?? hash,
    },
    raw: challenge,
    hash,
  };
}

function serializeMppChallenge(challenge: unknown): string {
  if (!isRecord(challenge)) {
    throw new WardenError("challenge_invalid", "Invalid MPP challenge");
  }
  const request = challenge.request;
  if (!isRecord(request)) {
    throw new WardenError("challenge_invalid", "Invalid MPP challenge request");
  }
  const required = ["id", "realm", "method", "intent"] as const;
  const parts: string[] = [];
  for (const key of required) {
    const value = stringField(challenge, key);
    if (!value) {
      throw new WardenError("challenge_invalid", `MPP challenge missing ${key}`);
    }
    parts.push(`${key}="${escapeAuthParam(value)}"`);
  }
  parts.push(
    `request="${Buffer.from(JSON.stringify(request), "utf8").toString("base64url")}"`,
  );
  for (const key of ["description", "digest", "expires", "opaque"]) {
    const value = stringField(challenge, key);
    if (value) parts.push(`${key}="${escapeAuthParam(value)}"`);
  }
  return `Payment ${parts.join(", ")}`;
}

function serializeMppCredential(
  challenge: unknown,
  payload: Record<string, string>,
): string {
  if (!isRecord(challenge)) {
    throw new WardenError("challenge_invalid", "Invalid MPP challenge");
  }
  const request = challenge.request;
  if (!isRecord(request)) {
    throw new WardenError("challenge_invalid", "Invalid MPP challenge request");
  }
  const wireChallenge: Record<string, unknown> = {};
  for (const key of [
    "id",
    "realm",
    "method",
    "intent",
    "description",
    "digest",
    "expires",
    "opaque",
  ]) {
    const value = stringField(challenge, key);
    if (value !== undefined) wireChallenge[key] = value;
  }
  wireChallenge.request = Buffer.from(JSON.stringify(request), "utf8").toString(
    "base64url",
  );
  return `Payment ${Buffer.from(
    JSON.stringify({ challenge: wireChallenge, payload }),
    "utf8",
  ).toString("base64url")}`;
}

function escapeAuthParam(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function classifyMppNetwork(raw: string): ChallengeRequirement["network"] | undefined {
  if (raw === "mainnet" || raw === "mainnet-beta" || raw === "solana-mainnet") {
    return "solana-mainnet";
  }
  if (raw === "devnet" || raw === "solana-devnet") {
    return "solana-devnet";
  }
  return undefined;
}

function classifyMppToken(raw: string): ChallengeRequirement["token"] | undefined {
  if (
    raw.toUpperCase() === "USDC" ||
    raw === USDC_MAINNET_MINT ||
    raw === USDC_DEVNET_MINT ||
    raw === USDC_DEVNET_LEGACY_MINT ||
    raw === USDC_DEVNET_SPL_MINT
  ) {
    return "USDC";
  }
  if (raw.toUpperCase() === "SOL" || raw === "11111111111111111111111111111111") {
    return "SOL";
  }
  return undefined;
}

async function createWalletTransactionSigner(
  walletService: WalletService,
  walletId: string,
): Promise<TransactionSigner> {
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
  } as TransactionSigner;
}

function dummySigner(): TransactionSigner {
  return {
    address: address("11111111111111111111111111111111"),
    async signTransactions() {
      throw new WardenError("internal", "MPP parser dummy signer cannot sign");
    },
  } as TransactionSigner;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

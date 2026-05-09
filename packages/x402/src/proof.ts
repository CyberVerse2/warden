import { createHash } from "node:crypto";
import { generateJwt } from "@coinbase/cdp-sdk/auth";
import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import type { PaymentProof } from "@warden/core";
import type { WalletService } from "@warden/wallet";
import type { ParsedChallenge } from "./challenge.js";

export interface ProofBuilder {
  build(args: {
    walletId: string;
    challenge: ParsedChallenge;
    requestHash: string;
  }): Promise<PaymentProof>;
}

const USDC_DEVNET_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const USDC_MAINNET_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export interface CoinbaseSolanaProofBuilderOptions {
  rpcUrl: string;
  facilitatorUrl: string;
  cdpApiKeyId?: string | undefined;
  cdpApiKeySecret?: string | undefined;
  fetchImpl?: typeof fetch;
}

/**
 * Coinbase x402 facilitator on Solana. Constructs a real signed SPL-token
 * transfer transaction, asks the facilitator to verify it, then asks the
 * facilitator to settle (broadcast) it. Returns the resulting tx signature.
 */
export function createCoinbaseSolanaProofBuilder(
  walletService: WalletService,
  opts: CoinbaseSolanaProofBuilderOptions,
): ProofBuilder {
  if (!opts.facilitatorUrl) {
    throw new Error(
      "createCoinbaseSolanaProofBuilder: facilitatorUrl is required",
    );
  }
  const connection = new Connection(opts.rpcUrl, "confirmed");
  const facilitatorUrl = opts.facilitatorUrl.replace(/\/$/, "");
  const fetchImpl = opts.fetchImpl ?? fetch;
  const cdpApiKeyId = opts.cdpApiKeyId;
  const cdpApiKeySecret = opts.cdpApiKeySecret;

  async function facilitatorHeaders(endpoint: "verify" | "settle") {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };

    if (!cdpApiKeyId && !cdpApiKeySecret) return headers;
    if (!cdpApiKeyId || !cdpApiKeySecret) {
      throw new Error(
        "Coinbase facilitator auth requires both CDP_API_KEY_ID and CDP_API_KEY_SECRET",
      );
    }

    const url = new URL(`${facilitatorUrl}/${endpoint}`);
    const token = await generateJwt({
      apiKeyId: cdpApiKeyId,
      apiKeySecret: cdpApiKeySecret,
      requestMethod: "POST",
      requestHost: url.host,
      requestPath: `${url.pathname}${url.search}`,
      expiresIn: 120,
    });
    headers.authorization = `Bearer ${token}`;
    return headers;
  }

  return {
    async build({ walletId, challenge, requestHash }) {
      if (challenge.requirement.token !== "USDC") {
        throw new Error("Coinbase Solana x402 builder only supports USDC");
      }

      const payer = new PublicKey(await walletService.getPublicKey(walletId));
      const payTo = new PublicKey(challenge.requirement.recipient);
      const mint = new PublicKey(
        challenge.requirement.network === "solana-mainnet"
          ? USDC_MAINNET_MINT
          : USDC_DEVNET_MINT,
      );
      const payerAta = getAssociatedTokenAddressSync(mint, payer);
      const payToAta = getAssociatedTokenAddressSync(mint, payTo);
      const transaction = new Transaction();
      const payToAccount = await connection.getAccountInfo(payToAta);

      if (!payToAccount) {
        transaction.add(
          createAssociatedTokenAccountInstruction(payer, payToAta, payTo, mint),
        );
      }
      transaction.add(
        createTransferInstruction(
          payerAta,
          payToAta,
          payer,
          BigInt(challenge.requirement.amountRaw),
        ),
      );
      transaction.feePayer = payer;
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");
      transaction.recentBlockhash = blockhash;

      const signed = await walletService.signTransaction(walletId, transaction);
      const envelope = {
        x402Version: challenge.raw.extra?.["x402Version"] ?? 1,
        scheme: "exact",
        network: challenge.raw.network,
        payload: {
          transaction: signed.transactionBase64,
          requestHash,
          challengeHash: challenge.hash,
          lastValidBlockHeight,
        },
      };
      const headerJson = JSON.stringify(envelope);

      const verify = await fetchImpl(`${facilitatorUrl}/verify`, {
        method: "POST",
        headers: await facilitatorHeaders("verify"),
        body: JSON.stringify({
          paymentPayload: envelope,
          paymentRequirements: challenge.raw,
        }),
      });
      if (!verify.ok) {
        throw new Error(
          `Coinbase facilitator verify failed: ${verify.status} ${await verify.text().catch(() => "")}`,
        );
      }

      const settle = await fetchImpl(`${facilitatorUrl}/settle`, {
        method: "POST",
        headers: await facilitatorHeaders("settle"),
        body: JSON.stringify({
          paymentPayload: envelope,
          paymentRequirements: challenge.raw,
        }),
      });
      if (!settle.ok) {
        throw new Error(
          `Coinbase facilitator settle failed: ${settle.status} ${await settle.text().catch(() => "")}`,
        );
      }

      return {
        header: Buffer.from(headerJson, "utf8").toString("base64"),
        proofHash: createHash("sha256").update(headerJson).digest("hex"),
        txSignature: signed.signature,
      };
    },
  };
}

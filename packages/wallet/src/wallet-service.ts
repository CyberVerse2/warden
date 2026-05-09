import { createHash } from "node:crypto";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  getAccount,
  getAssociatedTokenAddressSync,
  TokenAccountNotFoundError,
} from "@solana/spl-token";
import { newId, WardenError, type Network } from "@warden/core";
import { wallets, type Db } from "@warden/db";
import { eq } from "drizzle-orm";
import nacl from "tweetnacl";
import { decryptSecret, encryptSecret } from "./crypto.js";

const USDC_MINT: Record<Network, string> = {
  "solana-mainnet": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "solana-devnet": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
};

export interface WalletService {
  createWallet(input: {
    agentId: string;
    network: Network;
  }): Promise<{ walletId: string; publicKey: string }>;

  getPublicKey(walletId: string): Promise<string>;

  getBalance(walletId: string): Promise<{ lamports: number }>;

  /**
   * Read the wallet's USDC SPL token balance. Returns 0 if no token account
   * exists yet. The amount is in USDC base units (6 decimals).
   */
  getUsdcBalance(walletId: string): Promise<{ raw: bigint; usd: number }>;

  /**
   * Sign an opaque payload (e.g. an x402 challenge digest) using the wallet's
   * Ed25519 secret key. The plaintext secret is decrypted in-memory and zeroed
   * immediately after signing.
   */
  signPayload(
    walletId: string,
    payload: Buffer,
  ): Promise<{ signatureBase64: string; publicKey: string }>;

  signTransaction(
    walletId: string,
    transaction: Transaction,
  ): Promise<{ transactionBase64: string; signature: string; publicKey: string }>;

  revoke(walletId: string): Promise<void>;
}

export interface WalletServiceDeps {
  db: Db;
  rpcUrl: string;
}

export function createWalletService({
  db,
  rpcUrl,
}: WalletServiceDeps): WalletService {
  const connection = new Connection(rpcUrl, "confirmed");

  async function loadWallet(walletId: string) {
    const [row] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.id, walletId));
    if (!row) {
      throw new WardenError("wallet_not_found", `Wallet ${walletId} not found`);
    }
    return row;
  }

  return {
    async createWallet({ agentId, network }) {
      const keypair = Keypair.generate();
      const walletId = newId.wallet();
      const enc = encryptSecret(Buffer.from(keypair.secretKey), walletId);
      await db.insert(wallets).values({
        id: walletId,
        agentId,
        network,
        publicKey: keypair.publicKey.toBase58(),
        encryptedSecret: enc.ciphertext,
        iv: enc.iv,
        authTag: enc.authTag,
        status: "active",
      });
      return { walletId, publicKey: keypair.publicKey.toBase58() };
    },

    async getPublicKey(walletId) {
      const row = await loadWallet(walletId);
      return row.publicKey;
    },

    async getBalance(walletId) {
      const row = await loadWallet(walletId);
      const lamports = await connection.getBalance(new PublicKey(row.publicKey));
      return { lamports };
    },

    async getUsdcBalance(walletId) {
      const row = await loadWallet(walletId);
      const owner = new PublicKey(row.publicKey);
      const mint = new PublicKey(USDC_MINT[row.network]);
      const ata = getAssociatedTokenAddressSync(mint, owner);
      try {
        const account = await getAccount(connection, ata);
        const raw = account.amount;
        return { raw, usd: Number(raw) / 1_000_000 };
      } catch (error) {
        if (error instanceof TokenAccountNotFoundError) {
          return { raw: 0n, usd: 0 };
        }
        throw error;
      }
    },

    async signPayload(walletId, payload) {
      const row = await loadWallet(walletId);
      if (row.status !== "active") {
        throw new WardenError("agent_revoked", "Wallet is revoked");
      }
      const secret = decryptSecret(
        {
          ciphertext: row.encryptedSecret,
          iv: row.iv,
          authTag: row.authTag,
        },
        row.id,
      );
      try {
        const digest = createHash("sha256").update(payload).digest();
        const sig = nacl.sign.detached(digest, secret);
        return {
          signatureBase64: Buffer.from(sig).toString("base64"),
          publicKey: row.publicKey,
        };
      } finally {
        secret.fill(0);
      }
    },

    async signTransaction(walletId, transaction) {
      const row = await loadWallet(walletId);
      if (row.status !== "active") {
        throw new WardenError("agent_revoked", "Wallet is revoked");
      }
      const secret = decryptSecret(
        {
          ciphertext: row.encryptedSecret,
          iv: row.iv,
          authTag: row.authTag,
        },
        row.id,
      );
      try {
        const keypair = Keypair.fromSecretKey(secret);
        transaction.sign(keypair);
        const signature = transaction.signature?.toString("base64");
        if (!signature) {
          throw new WardenError("payment_failed", "Transaction was not signed");
        }
        return {
          transactionBase64: transaction.serialize().toString("base64"),
          signature,
          publicKey: row.publicKey,
        };
      } finally {
        secret.fill(0);
      }
    },

    async revoke(walletId) {
      await db
        .update(wallets)
        .set({ status: "revoked" })
        .where(eq(wallets.id, walletId));
    },
  };
}

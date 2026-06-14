import { CELO_MAINNET_NETWORK, newId, WardenError, type Network } from "@warden/core";
import { wallets, type Db } from "@warden/db";
import { eq } from "drizzle-orm";
import {
  createPublicClient,
  erc20Abi,
  formatUnits,
  http,
  isAddress,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { celo, celoSepolia } from "viem/chains";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { decryptSecret, encryptSecret } from "./crypto";

const USDC_CONTRACT: Record<Network, Address> = {
  "eip155:42220": "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
  "eip155:11142220": "0x01C5C0122039549AD1493B8220cABEdD739BC44E",
};

export type TypedDataToSign = {
  domain: Record<string, unknown>;
  types: Record<string, unknown>;
  primaryType: string;
  message: Record<string, unknown>;
};

export interface WalletService {
  createWallet(input: {
    agentId: string;
    network: Network;
  }): Promise<{ walletId: string; publicKey: string }>;

  getPublicKey(walletId: string): Promise<string>;

  getBalance(walletId: string): Promise<{ wei: bigint; celo: number }>;

  getUsdcBalance(walletId: string): Promise<{ raw: bigint; usd: number }>;

  signTypedData(
    walletId: string,
    typedData: TypedDataToSign,
  ): Promise<{ signature: Hex; publicKey: string }>;

  revoke(walletId: string): Promise<void>;
}

export interface WalletServiceDeps {
  db: Db;
  rpcUrl: string;
  rpcUrls?: {
    mainnet?: string | undefined;
    sepolia?: string | undefined;
  };
}

export function createWalletService({
  db,
  rpcUrl,
  rpcUrls,
}: WalletServiceDeps): WalletService {
  const clients = new Map<string, PublicClient>();

  function rpcUrlFor(network: Network) {
    return network === CELO_MAINNET_NETWORK
      ? rpcUrls?.mainnet ?? rpcUrl
      : rpcUrls?.sepolia ?? rpcUrl;
  }

  function clientFor(network: Network) {
    const url = rpcUrlFor(network);
    const cached = clients.get(`${network}:${url}`);
    if (cached) return cached;
    const client = createPublicClient({
      chain: network === CELO_MAINNET_NETWORK ? celo : celoSepolia,
      transport: http(url),
    }) as PublicClient;
    clients.set(`${network}:${url}`, client);
    return client;
  }

  async function loadWallet(walletId: string) {
    const [row] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.id, walletId));
    if (!row) {
      throw new WardenError("wallet_not_found", `Wallet ${walletId} not found`);
    }
    if (!isAddress(row.publicKey)) {
      throw new WardenError("internal", `Wallet ${walletId} has an invalid EVM address`);
    }
    return { ...row, publicKey: row.publicKey as Address };
  }

  function accountFor(row: Awaited<ReturnType<typeof loadWallet>>) {
    const secret = decryptSecret(
      {
        ciphertext: row.encryptedSecret,
        iv: row.iv,
        authTag: row.authTag,
      },
      row.id,
    );
    try {
      return privateKeyToAccount(`0x${secret.toString("hex")}` as Hex);
    } finally {
      secret.fill(0);
    }
  }

  return {
    async createWallet({ agentId, network }) {
      const privateKey = generatePrivateKey();
      const account = privateKeyToAccount(privateKey);
      const walletId = newId.wallet();
      const enc = encryptSecret(Buffer.from(privateKey.slice(2), "hex"), walletId);
      await db.insert(wallets).values({
        id: walletId,
        agentId,
        network,
        publicKey: account.address,
        encryptedSecret: enc.ciphertext,
        iv: enc.iv,
        authTag: enc.authTag,
        status: "active",
      });
      return { walletId, publicKey: account.address };
    },

    async getPublicKey(walletId) {
      const row = await loadWallet(walletId);
      return row.publicKey;
    },

    async getBalance(walletId) {
      const row = await loadWallet(walletId);
      const wei = await clientFor(row.network).getBalance({
        address: row.publicKey,
      });
      return { wei, celo: Number(formatUnits(wei, 18)) };
    },

    async getUsdcBalance(walletId) {
      const row = await loadWallet(walletId);
      const raw = await clientFor(row.network).readContract({
        address: USDC_CONTRACT[row.network],
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [row.publicKey],
      });
      return { raw, usd: Number(formatUnits(raw, 6)) };
    },

    async signTypedData(walletId, typedData) {
      const row = await loadWallet(walletId);
      if (row.status !== "active") {
        throw new WardenError("agent_revoked", "Wallet is revoked");
      }
      const account = accountFor(row);
      const signature = await account.signTypedData(typedData as never);
      return { signature, publicKey: row.publicKey };
    },

    async revoke(walletId) {
      await db
        .update(wallets)
        .set({ status: "revoked" })
        .where(eq(wallets.id, walletId));
    },
  };
}

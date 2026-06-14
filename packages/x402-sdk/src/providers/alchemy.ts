import { z } from "zod";
import { postJson } from "../http";
import type { PaidOperation } from "../types";

const AlchemyTokenBalancesInputSchema = z.object({
  network: z.string().default("eth-mainnet"),
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  tokens: z.union([z.literal("erc20"), z.array(z.string()).min(1)]).default("erc20"),
});

const AlchemyNativeBalanceInputSchema = z.object({
  network: z.string().default("eth-mainnet"),
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

const AlchemyTokenMetadataInputSchema = z.object({
  network: z.string().default("eth-mainnet"),
  contractAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

export interface AlchemyOperationsOptions {
  apiKey: string;
  prices?: Partial<Record<"tokenBalances" | "nativeBalance" | "tokenMetadata", string>>;
}

export function createAlchemyOperations(
  options: AlchemyOperationsOptions,
): PaidOperation[] {
  return [
    {
      id: "crypto.tokenBalances",
      category: "crypto",
      provider: "alchemy",
      method: "POST",
      path: "/crypto/token-balances",
      description: "Fetch ERC-20 token balances with Alchemy.",
      price: { amountUsd: options.prices?.tokenBalances ?? "0.02" },
      input: AlchemyTokenBalancesInputSchema,
      async handler(input, context) {
        const parsed = AlchemyTokenBalancesInputSchema.parse(input);
        return postJson(
          context.fetch,
          alchemyRpcUrl(parsed.network, options.apiKey),
          {},
          {
            jsonrpc: "2.0",
            id: 1,
            method: "alchemy_getTokenBalances",
            params: [parsed.address, parsed.tokens],
          },
        );
      },
    },
    {
      id: "crypto.nativeBalance",
      category: "crypto",
      provider: "alchemy",
      method: "POST",
      path: "/crypto/native-balance",
      description: "Fetch native token balance with Alchemy JSON-RPC.",
      price: { amountUsd: options.prices?.nativeBalance ?? "0.01" },
      input: AlchemyNativeBalanceInputSchema,
      async handler(input, context) {
        const parsed = AlchemyNativeBalanceInputSchema.parse(input);
        return postJson(
          context.fetch,
          alchemyRpcUrl(parsed.network, options.apiKey),
          {},
          {
            jsonrpc: "2.0",
            id: 1,
            method: "eth_getBalance",
            params: [parsed.address, "latest"],
          },
        );
      },
    },
    {
      id: "crypto.tokenMetadata",
      category: "crypto",
      provider: "alchemy",
      method: "POST",
      path: "/crypto/token-metadata",
      description: "Fetch ERC-20 token metadata with Alchemy.",
      price: { amountUsd: options.prices?.tokenMetadata ?? "0.01" },
      input: AlchemyTokenMetadataInputSchema,
      async handler(input, context) {
        const parsed = AlchemyTokenMetadataInputSchema.parse(input);
        return postJson(
          context.fetch,
          alchemyRpcUrl(parsed.network, options.apiKey),
          {},
          {
            jsonrpc: "2.0",
            id: 1,
            method: "alchemy_getTokenMetadata",
            params: [parsed.contractAddress],
          },
        );
      },
    },
  ];
}

function alchemyRpcUrl(network: string, apiKey: string): string {
  return `https://${network}.g.alchemy.com/v2/${apiKey}`;
}

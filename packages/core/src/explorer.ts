import {
  CELO_MAINNET_NETWORK,
  CELO_SEPOLIA_NETWORK,
  type Network,
} from "./types";

const CELO_EXPLORERS: Record<Network, string> = {
  [CELO_MAINNET_NETWORK]: "https://celo.blockscout.com",
  [CELO_SEPOLIA_NETWORK]: "https://celo-sepolia.blockscout.com",
};

export function blockscoutTxUrl(network: string, txSignature: string | undefined) {
  if (!txSignature || !/^0x[0-9a-fA-F]{64}$/.test(txSignature)) return undefined;
  if (network !== CELO_MAINNET_NETWORK && network !== CELO_SEPOLIA_NETWORK) {
    return undefined;
  }
  return `${CELO_EXPLORERS[network]}/tx/${txSignature}`;
}

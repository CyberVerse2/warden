export const CELO_MAINNET_NETWORK = "eip155:42220";
export const CELO_SEPOLIA_NETWORK = "eip155:11142220";

export type Network =
  | typeof CELO_MAINNET_NETWORK
  | typeof CELO_SEPOLIA_NETWORK;

export type SupportedToken = "USDC";

export type AgentStatus = "active" | "revoked";

export type Decision = "allow" | "deny" | "failed";

export type ApprovalStatus = "pending" | "approved" | "denied" | "expired";

export interface ChallengeRequirement {
  /** Network the payment must be made on. */
  network: Network;
  /** ERC-20 payment token. */
  token: SupportedToken;
  /** Recipient EVM address. */
  recipient: string;
  /** Amount in smallest unit (e.g. USDC has 6 decimals). */
  amountRaw: string;
  /** USD-denominated amount (USDC ~= 1:1). */
  amountUsd: number;
  /** Opaque facilitator-supplied nonce / challenge id. */
  nonce: string;
  /** Optional facilitator URL that verifies the proof. */
  facilitator?: string;
}

export interface PaymentProof {
  /** Payment header value to attach to the retried HTTP request. */
  header: string;
  /** Header name; x402 v1 uses X-PAYMENT, x402 v2 uses PAYMENT-SIGNATURE. */
  headerName?: string;
  /** Extra payment-adjacent headers, such as SIGN-IN-WITH-X. */
  extraHeaders?: Record<string, string>;
  /** Hash of the proof payload (sha256 hex) for receipt audit. */
  proofHash: string;
  /** Optional transaction signature once submitted. */
  txSignature?: string;
}

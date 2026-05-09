export type Network = "solana-mainnet" | "solana-devnet";

export type SupportedToken = "USDC" | "SOL";

export type AgentStatus = "active" | "revoked";

export type Decision = "allow" | "deny" | "failed";

export type ApprovalStatus = "pending" | "approved" | "denied" | "expired";

export interface ChallengeRequirement {
  /** Network the payment must be made on. */
  network: Network;
  /** SPL token mint or "SOL". For USDC on devnet/mainnet, the mint string. */
  token: SupportedToken;
  /** Recipient base58-encoded public key. */
  recipient: string;
  /** Amount in smallest unit (e.g. USDC has 6 decimals). */
  amountRaw: string;
  /** USD-denominated amount (USDC ~= 1:1, SOL converted via oracle). */
  amountUsd: number;
  /** Opaque facilitator-supplied nonce / challenge id. */
  nonce: string;
  /** Optional facilitator URL that verifies the proof. */
  facilitator?: string;
}

export interface PaymentProof {
  /** Header value to attach to the retried HTTP request as `X-PAYMENT`. */
  header: string;
  /** Hash of the proof payload (sha256 hex) for receipt audit. */
  proofHash: string;
  /** Optional Solana transaction signature once submitted. */
  txSignature?: string;
}

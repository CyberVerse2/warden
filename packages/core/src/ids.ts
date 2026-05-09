import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

function nano(size = 16): string {
  const bytes = randomBytes(size);
  let out = "";
  for (let i = 0; i < size; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

export const newId = {
  user: () => `usr_${nano()}`,
  agent: () => `agt_${nano()}`,
  wallet: () => `wal_${nano()}`,
  policy: () => `pol_${nano()}`,
  receipt: () => `rcp_${nano()}`,
  approval: () => `apr_${nano()}`,
  token: () => `tok_${nano(24)}`,
};

export type AgentId = string;
export type WalletId = string;
export type PolicyId = string;
export type ReceiptId = string;
export type ApprovalId = string;
export type UserId = string;

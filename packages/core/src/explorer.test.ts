import { describe, expect, it } from "vitest";
import { blockscoutTxUrl } from "./explorer";

const txHash = `0x${"a".repeat(64)}`;

describe("blockscoutTxUrl", () => {
  it("links Celo Mainnet transactions", () => {
    expect(blockscoutTxUrl("eip155:42220", txHash)).toBe(
      `https://celo.blockscout.com/tx/${txHash}`,
    );
  });

  it("links Celo Testnet transactions", () => {
    expect(blockscoutTxUrl("eip155:11142220", txHash)).toBe(
      `https://celo-sepolia.blockscout.com/tx/${txHash}`,
    );
  });

  it("does not link unsupported networks or invalid hashes", () => {
    expect(blockscoutTxUrl("eip155:8453", txHash)).toBeUndefined();
    expect(blockscoutTxUrl("eip155:11142220", "txn_123")).toBeUndefined();
  });
});

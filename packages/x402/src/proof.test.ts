import { CELO_SEPOLIA_NETWORK } from "@warden/core";
import { describe, expect, it } from "vitest";
import type { WalletService, TypedDataToSign } from "@warden/wallet";
import { createX402EvmProofBuilder } from "./proof";
import type { ParsedChallenge } from "./challenge";

describe("createX402EvmProofBuilder", () => {
  it("signs Celo USDC payments with EIP-712 domain parameters", async () => {
    let typedData: TypedDataToSign | undefined;
    const walletService = {
      async getPublicKey() {
        return "0x946695E5C3d73F63Dc471B1592fB8EFF8e3c6a31";
      },
      async signTypedData(_walletId: string, input: TypedDataToSign) {
        typedData = input;
        return {
          publicKey: "0x946695E5C3d73F63Dc471B1592fB8EFF8e3c6a31",
          signature: `0x${"11".repeat(65)}` as `0x${string}`,
        };
      },
    } as Pick<WalletService, "getPublicKey" | "signTypedData"> as WalletService;

    const builder = createX402EvmProofBuilder(walletService, {});
    const challenge: ParsedChallenge = {
      requirement: {
        network: CELO_SEPOLIA_NETWORK,
        token: "USDC",
        recipient: "0x010F980f735Af5b2cbd90CA500E94733264e6b71",
        amountRaw: "10000",
        amountUsd: 0.01,
        nonce: "challenge",
      },
      raw: {
        scheme: "exact",
        network: CELO_SEPOLIA_NETWORK,
        asset: "0x01C5C0122039549AD1493B8220cABEdD739BC44E",
        amount: "10000",
        payTo: "0x010F980f735Af5b2cbd90CA500E94733264e6b71",
        maxTimeoutSeconds: 300,
        extra: {
          name: "USDC",
          version: "2",
        },
      },
      x402Version: 2,
      hash: "challenge",
    };

    const proof = await builder.build({
      walletId: "wal_test",
      challenge,
      requestHash: "request",
    });

    expect(proof.headerName).toBe("PAYMENT-SIGNATURE");
    expect(typedData?.domain).toMatchObject({
      name: "USDC",
      version: "2",
      chainId: 11142220,
      verifyingContract: "0x01C5C0122039549AD1493B8220cABEdD739BC44E",
    });
  });
});

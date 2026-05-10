import { describe, expect, it } from "vitest";
import { parseMppChallenge } from "./mpp";

describe("parseMppChallenge", () => {
  it("parses Solana MPP charge challenges from WWW-Authenticate", () => {
    const request = Buffer.from(
      JSON.stringify({
        amount: "30",
        currency: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        recipient: "Cs2zdfUNonRdRGsiZUQQLdTxzxVvJZmgiX2mpLYKuEqP",
        methodDetails: {
          decimals: 6,
          feePayer: true,
          feePayerKey: "BcdwLA62UPEAvRn7AWauMUXKtYMXxdLzTPaSQg5tNaFc",
          network: "mainnet",
          recentBlockhash: "GvCeaTmbf1rMiD1fZ3aXj1cTLeUbYqX3Jwf61yk2cgEU",
        },
      }),
    ).toString("base64url");
    const parsed = parseMppChallenge({
      "www-authenticate": `Payment id="tts", realm="MPP Payment", method="solana", intent="charge", request="${request}"`,
    });

    expect(parsed?.requirement).toMatchObject({
      amountRaw: "30",
      amountUsd: 0.00003,
      network: "solana-mainnet",
      recipient: "Cs2zdfUNonRdRGsiZUQQLdTxzxVvJZmgiX2mpLYKuEqP",
      token: "USDC",
    });
  });
});

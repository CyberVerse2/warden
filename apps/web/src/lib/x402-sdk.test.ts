import { afterEach, describe, expect, it, vi } from "vitest";
import { CELO_SEPOLIA_USDC } from "@warden/x402-sdk";
import { configuredOperations, createHostedWardenX402Sdk } from "./x402-sdk";

const envKeys = [
  "OPENAI_API_KEY",
  "FAL_KEY",
  "FAL_API_KEY",
  "FISH_API_KEY",
  "FISH_AUDIO_API_KEY",
  "EXA_API_KEY",
  "TAVILY_API_KEY",
  "ALCHEMY_API_KEY",
  "RESEND_API_KEY",
  "WARDEN_X402_FACILITATOR_URL",
  "WARDEN_X402_PAY_TO",
  "WARDEN_X402_ASSET",
  "WARDEN_X402_NETWORK",
  "THIRDWEB_SECRET_KEY",
  "THIRDWEB_VAULT_ACCESS_TOKEN",
] as const;

describe("hosted Warden x402 SDK", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("registers only approved provider-backed paid operations", () => {
    stubProviderEnv();

    expect(configuredOperations().map((operation) => operation.id)).toEqual([
      "ai.generateText",
      "ai.extractStructured",
      "ai.embed",
      "ai.moderate",
      "media.runModel",
      "media.generateImage",
      "media.generateVideo",
      "audio.textToSpeech",
      "audio.listVoices",
      "search.web",
      "crypto.tokenBalances",
      "crypto.nativeBalance",
      "crypto.tokenMetadata",
      "messaging.sendEmail",
    ]);
  });

  it("creates the app-hosted SDK manifest from env configuration", () => {
    stubProviderEnv();
    vi.stubEnv("WARDEN_X402_PAY_TO", "0xed1AFc4DCfb39b9ab9d67f3f7f7d02803cEA9FC5");
    vi.stubEnv("THIRDWEB_SECRET_KEY", "thirdweb-secret-key");

    const manifest = createHostedWardenX402Sdk().manifest();

    expect(manifest).toMatchObject({
      asset: CELO_SEPOLIA_USDC,
      payTo: "0xed1AFc4DCfb39b9ab9d67f3f7f7d02803cEA9FC5",
    });
    expect(
      manifest.operations.some((operation) => operation.id === "ai.generateText"),
    ).toBe(true);
    expect(
      manifest.operations.some((operation) => operation.provider === "exa"),
    ).toBe(true);
  });
});

function stubProviderEnv() {
  for (const key of envKeys) vi.stubEnv(key, "");
  vi.stubEnv("OPENAI_API_KEY", "openai-key");
  vi.stubEnv("FAL_KEY", "fal-key");
  vi.stubEnv("FISH_API_KEY", "fish-key");
  vi.stubEnv("EXA_API_KEY", "exa-key");
  vi.stubEnv("TAVILY_API_KEY", "tavily-key");
  vi.stubEnv("ALCHEMY_API_KEY", "alchemy-key");
  vi.stubEnv("RESEND_API_KEY", "resend-key");
}

import { CELO_SEPOLIA_NETWORK } from "@warden/core";
import {
  CELO_SEPOLIA_USDC,
  createAlchemyOperations,
  createExaOperations,
  createFalOperations,
  createFishAudioOperations,
  createOpenAiOperations,
  createResendOperations,
  createTavilyOperations,
  createThirdwebPaymentVerifier,
  createWardenX402Sdk,
  type CeloNetwork,
  type PaidOperation,
  type WardenX402Sdk,
} from "@warden/x402-sdk";
import { requireEnv } from "@warden/core";

export function createHostedWardenX402Sdk(): WardenX402Sdk {
  const payTo = requireEnv("WARDEN_X402_PAY_TO");
  const operations = configuredOperations();
  if (operations.length === 0) {
    throw new Error("No Warden x402 SDK provider credentials are configured");
  }

  return createWardenX402Sdk({
    network: networkEnv(),
    asset: envString("WARDEN_X402_ASSET") ?? CELO_SEPOLIA_USDC,
    payTo,
    verifier: createThirdwebPaymentVerifier({
      secretKey: requireEnv("THIRDWEB_SECRET_KEY"),
      serverWalletAddress: requireEnv("THIRDWEB_SERVER_WALLET_ADDRESS"),
    }),
    operations,
  });
}

export function configuredOperations(): PaidOperation[] {
  const operations: PaidOperation[] = [];

  if (process.env.OPENAI_API_KEY) {
    operations.push(
      ...createOpenAiOperations({ apiKey: process.env.OPENAI_API_KEY }),
    );
  }
  const falKey = process.env.FAL_KEY ?? process.env.FAL_API_KEY;
  if (falKey) {
    operations.push(
      ...createFalOperations({
        apiKey: falKey,
      }),
    );
  }
  const fishKey = process.env.FISH_API_KEY ?? process.env.FISH_AUDIO_API_KEY;
  if (fishKey) {
    operations.push(
      ...createFishAudioOperations({
        apiKey: fishKey,
      }),
    );
  }
  if (process.env.EXA_API_KEY) {
    operations.push(...createExaOperations({ apiKey: process.env.EXA_API_KEY }));
  } else if (process.env.TAVILY_API_KEY) {
    operations.push(
      ...createTavilyOperations({ apiKey: process.env.TAVILY_API_KEY }),
    );
  }
  if (process.env.ALCHEMY_API_KEY) {
    operations.push(
      ...createAlchemyOperations({ apiKey: process.env.ALCHEMY_API_KEY }),
    );
  }
  if (process.env.RESEND_API_KEY) {
    operations.push(...createResendOperations({ apiKey: process.env.RESEND_API_KEY }));
  }

  return operations;
}

function networkEnv(): CeloNetwork {
  return (envString("WARDEN_X402_NETWORK") ?? CELO_SEPOLIA_NETWORK) as CeloNetwork;
}

function envString(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

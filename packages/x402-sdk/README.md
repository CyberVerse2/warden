# @warden/x402-sdk

Reusable Celo x402 SDK for registering paid operations and exposing them to
other projects.

## Providers

The SDK intentionally supports this provider set:

- AI: OpenAI
- Media: fal
- Audio: Fish Audio
- Search: Tavily or Exa
- Crypto/data: Alchemy
- Messaging: Resend

## Usage

```ts
import {
  createWardenX402Sdk,
  createOpenAiOperations,
  createFalOperations,
  createFishAudioOperations,
  createTavilyOperations,
  createAlchemyOperations,
  createResendOperations,
} from "@warden/x402-sdk";

const sdk = createWardenX402Sdk({
  payTo: "0xYourCeloAddress",
  facilitatorUrl: "https://your-celo-x402-facilitator.example",
  verifier,
  operations: [
    ...createOpenAiOperations({ apiKey: process.env.OPENAI_API_KEY! }),
    ...createFalOperations({ apiKey: process.env.FAL_API_KEY! }),
    ...createFishAudioOperations({ apiKey: process.env.FISH_AUDIO_API_KEY! }),
    ...createTavilyOperations({ apiKey: process.env.TAVILY_API_KEY! }),
    ...createAlchemyOperations({ apiKey: process.env.ALCHEMY_API_KEY! }),
    ...createResendOperations({ apiKey: process.env.RESEND_API_KEY! }),
  ],
});
```

`sdk.manifest()` returns operation metadata for discovery.

`sdk.quote(operationId)` returns a Celo USDC x402 payment requirement.

`sdk.execute({ operationId, input, paymentHeader })` verifies payment through
the configured verifier, executes the registered provider operation, and returns
a receipt-shaped execution result.

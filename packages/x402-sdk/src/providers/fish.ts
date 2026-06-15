import { Buffer } from "node:buffer";
import { z } from "zod";
import type { PaidOperation } from "../types";

const FishTtsInputSchema = z.object({
  text: z.string().min(1),
  referenceId: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .optional(),
  model: z.enum(["s1", "s2-pro"]).default("s2-pro"),
  format: z.enum(["mp3", "wav", "pcm"]).default("mp3"),
  sampleRate: z.number().int().positive().default(44100),
});

const FishListVoicesInputSchema = z.object({
  pageSize: z.number().int().positive().max(100).default(20),
});

export interface FishAudioOperationsOptions {
  apiKey: string;
  baseUrl?: string;
  prices?: Partial<Record<"textToSpeech" | "listVoices", string>>;
}

export function createFishAudioOperations(
  options: FishAudioOperationsOptions,
): PaidOperation[] {
  const baseUrl = options.baseUrl ?? "https://api.fish.audio";

  return [
    {
      id: "audio.textToSpeech",
      category: "audio",
      provider: "fish",
      method: "POST",
      path: "/audio/text-to-speech",
      description: "Convert text to speech through Fish Audio.",
      price: { amountUsd: options.prices?.textToSpeech ?? "0.04" },
      input: FishTtsInputSchema,
      async handler(input, context) {
        const parsed = FishTtsInputSchema.parse(input);
        const response = await context.fetch(`${baseUrl}/v1/tts`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${options.apiKey}`,
            "content-type": "application/json",
            model: parsed.model,
          },
          body: JSON.stringify({
            text: parsed.text,
            ...(parsed.referenceId ? { reference_id: parsed.referenceId } : {}),
            format: parsed.format,
            sample_rate: parsed.sampleRate,
          }),
        });
        if (!response.ok) {
          throw new Error(`Fish Audio TTS failed: ${response.status} ${await response.text()}`);
        }
        const audio = Buffer.from(await response.arrayBuffer()).toString("base64");
        return {
          contentType:
            parsed.format === "mp3"
              ? "audio/mpeg"
              : parsed.format === "wav"
                ? "audio/wav"
                : "audio/pcm",
          audioBase64: audio,
        };
      },
    },
    {
      id: "audio.listVoices",
      category: "audio",
      provider: "fish",
      method: "POST",
      path: "/audio/list-voices",
      description: "List available Fish Audio voice models.",
      price: { amountUsd: options.prices?.listVoices ?? "0.01" },
      input: FishListVoicesInputSchema,
      async handler(input, context) {
        const parsed = FishListVoicesInputSchema.parse(input);
        const url = new URL(`${baseUrl}/model`);
        url.searchParams.set("page_size", String(parsed.pageSize));
        const response = await context.fetch(url, {
          headers: { authorization: `Bearer ${options.apiKey}` },
        });
        if (!response.ok) {
          throw new Error(`Fish Audio model list failed: ${response.status} ${await response.text()}`);
        }
        return response.json();
      },
    },
  ];
}

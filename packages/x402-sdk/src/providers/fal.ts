import { z } from "zod";
import { postJson } from "../http";
import type { PaidOperation } from "../types";

const FalModelInputSchema = z.object({
  model: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()),
});

const FalImageInputSchema = z.object({
  prompt: z.string().min(1),
  model: z.string().default("fal-ai/flux/schnell"),
  imageSize: z.string().optional(),
});

const FalVideoInputSchema = z.object({
  prompt: z.string().min(1),
  model: z.string().default("fal-ai/veo3/fast"),
  imageUrl: z.string().url().optional(),
});

export interface FalOperationsOptions {
  apiKey: string;
  baseUrl?: string;
  prices?: Partial<Record<"runModel" | "generateImage" | "generateVideo", string>>;
}

export function createFalOperations(options: FalOperationsOptions): PaidOperation[] {
  const baseUrl = options.baseUrl ?? "https://fal.run";
  const headers = () => ({ authorization: `Key ${options.apiKey}` });

  return [
    {
      id: "media.runModel",
      category: "media",
      provider: "fal",
      method: "POST",
      path: "/media/run-model",
      description: "Run an arbitrary fal model with caller-supplied arguments.",
      price: { amountUsd: options.prices?.runModel ?? "0.05" },
      input: FalModelInputSchema,
      async handler(input, context) {
        const parsed = FalModelInputSchema.parse(input);
        return postJson(
          context.fetch,
          `${baseUrl}/${parsed.model}`,
          headers(),
          parsed.arguments,
        );
      },
    },
    {
      id: "media.generateImage",
      category: "media",
      provider: "fal",
      method: "POST",
      path: "/media/generate-image",
      description: "Generate an image through fal.",
      price: { amountUsd: options.prices?.generateImage ?? "0.06" },
      input: FalImageInputSchema,
      async handler(input, context) {
        const parsed = FalImageInputSchema.parse(input);
        return postJson(context.fetch, `${baseUrl}/${parsed.model}`, headers(), {
          prompt: parsed.prompt,
          ...(parsed.imageSize ? { image_size: parsed.imageSize } : {}),
        });
      },
    },
    {
      id: "media.generateVideo",
      category: "media",
      provider: "fal",
      method: "POST",
      path: "/media/generate-video",
      description: "Generate a video through fal.",
      price: { amountUsd: options.prices?.generateVideo ?? "0.30" },
      input: FalVideoInputSchema,
      async handler(input, context) {
        const parsed = FalVideoInputSchema.parse(input);
        return postJson(context.fetch, `${baseUrl}/${parsed.model}`, headers(), {
          prompt: parsed.prompt,
          ...(parsed.imageUrl ? { image_url: parsed.imageUrl } : {}),
        });
      },
    },
  ];
}

import { z } from "zod";
import { postJson } from "../http";
import type { PaidOperation } from "../types";

const OpenAiTextInputSchema = z.object({
  prompt: z.string().min(1),
  instructions: z.string().optional(),
  model: z.string().default("gpt-5.4-mini"),
});

const OpenAiStructuredInputSchema = OpenAiTextInputSchema.extend({
  jsonSchema: z.record(z.string(), z.unknown()),
});

const OpenAiEmbeddingInputSchema = z.object({
  input: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  model: z.string().default("text-embedding-3-small"),
});

const OpenAiModerationInputSchema = z.object({
  input: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  model: z.string().default("omni-moderation-latest"),
});

export interface OpenAiOperationsOptions {
  apiKey: string;
  baseUrl?: string;
  prices?: Partial<Record<"generateText" | "structured" | "embed" | "moderate", string>>;
}

export function createOpenAiOperations(
  options: OpenAiOperationsOptions,
): PaidOperation[] {
  const baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
  const headers = () => ({ authorization: `Bearer ${options.apiKey}` });

  return [
    {
      id: "ai.generateText",
      category: "ai",
      provider: "openai",
      method: "POST",
      path: "/ai/generate-text",
      description: "Generate text with OpenAI Responses API.",
      price: { amountUsd: options.prices?.generateText ?? "0.02" },
      input: OpenAiTextInputSchema,
      async handler(input, context) {
        const parsed = OpenAiTextInputSchema.parse(input);
        return postJson(context.fetch, `${baseUrl}/responses`, headers(), {
          model: parsed.model,
          input: parsed.prompt,
          ...(parsed.instructions ? { instructions: parsed.instructions } : {}),
        });
      },
    },
    {
      id: "ai.extractStructured",
      category: "ai",
      provider: "openai",
      method: "POST",
      path: "/ai/extract-structured",
      description: "Generate JSON-shaped output with OpenAI Responses API.",
      price: { amountUsd: options.prices?.structured ?? "0.04" },
      input: OpenAiStructuredInputSchema,
      async handler(input, context) {
        const parsed = OpenAiStructuredInputSchema.parse(input);
        return postJson(context.fetch, `${baseUrl}/responses`, headers(), {
          model: parsed.model,
          input: parsed.prompt,
          ...(parsed.instructions ? { instructions: parsed.instructions } : {}),
          text: {
            format: {
              type: "json_schema",
              name: "structured_result",
              schema: parsed.jsonSchema,
              strict: true,
            },
          },
        });
      },
    },
    {
      id: "ai.embed",
      category: "ai",
      provider: "openai",
      method: "POST",
      path: "/ai/embed",
      description: "Create OpenAI embeddings for text.",
      price: { amountUsd: options.prices?.embed ?? "0.01" },
      input: OpenAiEmbeddingInputSchema,
      async handler(input, context) {
        const parsed = OpenAiEmbeddingInputSchema.parse(input);
        return postJson(context.fetch, `${baseUrl}/embeddings`, headers(), parsed);
      },
    },
    {
      id: "ai.moderate",
      category: "ai",
      provider: "openai",
      method: "POST",
      path: "/ai/moderate",
      description: "Run OpenAI moderation over text.",
      price: { amountUsd: options.prices?.moderate ?? "0.01" },
      input: OpenAiModerationInputSchema,
      async handler(input, context) {
        const parsed = OpenAiModerationInputSchema.parse(input);
        return postJson(context.fetch, `${baseUrl}/moderations`, headers(), parsed);
      },
    },
  ];
}

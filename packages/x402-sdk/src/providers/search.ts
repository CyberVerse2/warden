import { z } from "zod";
import { postJson } from "../http";
import type { PaidOperation } from "../types";

const TavilySearchInputSchema = z.object({
  query: z.string().min(1),
  searchDepth: z.enum(["basic", "advanced"]).default("basic"),
  maxResults: z.number().int().positive().max(20).default(5),
  includeAnswer: z.boolean().default(true),
});

const ExaSearchInputSchema = z.object({
  query: z.string().min(1),
  numResults: z.number().int().positive().max(100).default(10),
  type: z
    .enum(["instant", "fast", "auto", "deep-lite", "deep", "deep-reasoning"])
    .default("auto"),
  includeText: z.boolean().default(true),
  includeHighlights: z.boolean().default(false),
});

export interface TavilyOperationsOptions {
  apiKey: string;
  baseUrl?: string;
  prices?: Partial<Record<"search", string>>;
}

export interface ExaOperationsOptions {
  apiKey: string;
  baseUrl?: string;
  prices?: Partial<Record<"search", string>>;
}

export function createTavilyOperations(
  options: TavilyOperationsOptions,
): PaidOperation[] {
  const baseUrl = options.baseUrl ?? "https://api.tavily.com";
  return [
    {
      id: "search.web",
      category: "search",
      provider: "tavily",
      method: "POST",
      path: "/search/web",
      description: "Search the web with Tavily.",
      price: { amountUsd: options.prices?.search ?? "0.03" },
      input: TavilySearchInputSchema,
      async handler(input, context) {
        const parsed = TavilySearchInputSchema.parse(input);
        return postJson(
          context.fetch,
          `${baseUrl}/search`,
          { authorization: `Bearer ${options.apiKey}` },
          {
            query: parsed.query,
            search_depth: parsed.searchDepth,
            max_results: parsed.maxResults,
            include_answer: parsed.includeAnswer,
          },
        );
      },
    },
  ];
}

export function createExaOperations(options: ExaOperationsOptions): PaidOperation[] {
  const baseUrl = options.baseUrl ?? "https://api.exa.ai";
  return [
    {
      id: "search.web",
      category: "search",
      provider: "exa",
      method: "POST",
      path: "/search/web",
      description: "Search the web with Exa.",
      price: { amountUsd: options.prices?.search ?? "0.03" },
      input: ExaSearchInputSchema,
      async handler(input, context) {
        const parsed = ExaSearchInputSchema.parse(input);
        return postJson(
          context.fetch,
          `${baseUrl}/search`,
          { "x-api-key": options.apiKey },
          {
            query: parsed.query,
            numResults: parsed.numResults,
            type: parsed.type,
            contents: {
              text: parsed.includeText,
              highlights: parsed.includeHighlights,
            },
          },
        );
      },
    },
  ];
}

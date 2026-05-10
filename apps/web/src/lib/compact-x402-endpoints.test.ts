import { describe, expect, it } from "vitest";
import { compactX402EndpointResult } from "./compact-x402-endpoints";

describe("compactX402EndpointResult", () => {
  it("reduces x402 endpoint metadata to model-usable summaries", () => {
    const result = compactX402EndpointResult({
      ok: true,
      data: {
        skill: {
          fqn: "paysponge/fal",
          title: "fal.ai",
          description: "Generate images and videos.",
          serviceUrl: "https://fal.x402.paysponge.com",
          endpointCount: 30,
          operations: [{ noisy: true }],
        },
        endpoints: [
          {
            method: "POST",
            path: "fal-ai/fast-sdxl",
            url: "https://fal.x402.paysponge.com/fal-ai/fast-sdxl",
            operationId: "submitFastSdxl",
            summary: "Submit a Fast SDXL image generation request",
            requestSchema: {
              type: "object",
              required: ["prompt"],
              properties: {
                prompt: { type: "string" },
                image_size: { type: "string" },
                num_images: { type: "integer" },
              },
            },
            responseSchema: {
              type: "object",
              properties: {
                request_id: { type: "string" },
              },
            },
            x402: {
              "x-payment-required": true,
              "x-payment-info": {
                price: "$0.01",
              },
              accepts: [{ noisy: true }],
            },
          },
        ],
      },
    });

    expect(result).toEqual({
      ok: true,
      data: {
        skill: {
          fqn: "paysponge/fal",
          title: "fal.ai",
          description: "Generate images and videos.",
          serviceUrl: "https://fal.x402.paysponge.com",
          endpointCount: 30,
        },
        endpoints: [
          {
            method: "POST",
            path: "fal-ai/fast-sdxl",
            url: "https://fal.x402.paysponge.com/fal-ai/fast-sdxl",
            operationId: "submitFastSdxl",
            summary: "Submit a Fast SDXL image generation request",
            requiredBodyFields: ["prompt"],
            optionalBodyFields: ["image_size", "num_images"],
            requestHint: "Requires body fields: prompt",
            price: "$0.01",
            paymentRequired: true,
            responseKind: "object",
          },
        ],
      },
    });
  });

  it("leaves non-endpoint results unchanged", () => {
    const result = { ok: true, data: { skills: [] } };
    expect(compactX402EndpointResult(result)).toBe(result);
  });

  it("reads endpoint metadata from skill.operations when MCP omits data.endpoints", () => {
    const result = compactX402EndpointResult({
      ok: true,
      data: {
        endpoints: [],
        skill: {
          fqn: "paysponge/fal",
          title: "fal.ai",
          endpointCount: 1,
          operations: [
            {
              method: "POST",
              path: "fal-ai/flux/dev",
              url: "https://fal.x402.paysponge.com/fal-ai/flux/dev",
              operationId: "submitFluxDev",
              requestSchema: {
                type: "object",
                required: ["prompt"],
                properties: {
                  prompt: { type: "string" },
                },
              },
            },
          ],
        },
      },
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        skill: {
          fqn: "paysponge/fal",
          title: "fal.ai",
          endpointCount: 1,
        },
        endpoints: [
          {
            method: "POST",
            path: "fal-ai/flux/dev",
            url: "https://fal.x402.paysponge.com/fal-ai/flux/dev",
            operationId: "submitFluxDev",
            requiredBodyFields: ["prompt"],
            requestHint: "Requires body fields: prompt",
          },
        ],
      },
    });
  });

  it("includes parameter hints for endpoints without JSON request schemas", () => {
    const result = compactX402EndpointResult({
      ok: true,
      data: {
        skill: { fqn: "paysponge/perplexity", title: "Perplexity" },
        endpoints: [
          {
            method: "POST",
            path: "search",
            url: "https://pplx.x402.paysponge.com/search",
            summary: "Search the Web",
            parameters: [
              { name: "query", in: "query", required: true },
              { name: "max_results", in: "query" },
            ],
          },
        ],
      },
    });

    expect(result).toMatchObject({
      data: {
        endpoints: [
          {
            parameters: ["query", "max_results"],
            requestHint: "Accepts parameters: query, max_results",
          },
        ],
      },
    });
  });

  it("resolves local request schema refs and allOf before summarizing endpoints", () => {
    const result = compactX402EndpointResult({
      ok: true,
      data: {
        skill: { fqn: "paysponge/perplexity", title: "Perplexity" },
        endpoints: [
          {
            method: "POST",
            path: "search",
            url: "https://pplx.x402.paysponge.com/search",
            summary: "Search the Web",
            requestSchema: {
              $ref: "#/components/schemas/ApiSearchRequest",
            },
            responseSchema: {
              $ref: "#/components/schemas/ApiSearchResponse",
            },
          },
        ],
      },
      components: {
        schemas: {
          ApiSearchRequest: {
            type: "object",
            allOf: [
              {
                type: "object",
                required: ["query"],
                properties: {
                  query: { type: "string" },
                  max_results: { type: "integer" },
                },
              },
              {
                type: "object",
                properties: {
                  search_language_filter: { type: "array" },
                },
              },
            ],
          },
          ApiSearchResponse: {
            type: "object",
            properties: {
              results: { type: "array" },
            },
          },
        },
      },
    });

    expect(result).toMatchObject({
      data: {
        endpoints: [
          {
            requiredBodyFields: ["query"],
            optionalBodyFields: ["max_results", "search_language_filter"],
            requestHint: "Requires body fields: query",
            responseKind: "object",
          },
        ],
      },
    });
  });
});

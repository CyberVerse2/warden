import { describe, expect, it } from "vitest";
import { compactX402EndpointResult } from "./compact-x402-endpoints";

describe("compactX402EndpointResult", () => {
  it("reduces x402 endpoint metadata to model-usable summaries", () => {
    const result = compactX402EndpointResult({
      ok: true,
      data: {
        skill: {
          fqn: "media.generateImage",
          title: "media.generateImage",
          description: "Generate images and videos.",
          serviceUrl: "https://warden.example/api/x402/media/generate-image",
          endpointCount: 1,
          operations: [{ noisy: true }],
        },
        endpoints: [
          {
            method: "POST",
            path: "/media/generate-image",
            url: "https://warden.example/api/x402/media/generate-image",
            operationId: "media.generateImage",
            summary: "Generate an image through fal.",
            requestSchema: {
              type: "object",
              required: ["prompt"],
              properties: {
                prompt: { type: "string" },
                imageSize: { type: "string" },
                model: { type: "string" },
              },
            },
            responseSchema: {
              type: "object",
              properties: {
                output: { type: "object" },
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
          fqn: "media.generateImage",
          title: "media.generateImage",
          description: "Generate images and videos.",
          serviceUrl: "https://warden.example/api/x402/media/generate-image",
          endpointCount: 1,
        },
        endpoints: [
          {
            method: "POST",
            path: "/media/generate-image",
            url: "https://warden.example/api/x402/media/generate-image",
            operationId: "media.generateImage",
            summary: "Generate an image through fal.",
            requiredBodyFields: ["prompt"],
            optionalBodyFields: ["imageSize", "model"],
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
          fqn: "media.generateImage",
          title: "media.generateImage",
          endpointCount: 1,
          operations: [
            {
              method: "POST",
              path: "/media/generate-image",
              url: "https://warden.example/api/x402/media/generate-image",
              operationId: "media.generateImage",
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
          fqn: "media.generateImage",
          title: "media.generateImage",
          endpointCount: 1,
        },
        endpoints: [
          {
            method: "POST",
            path: "/media/generate-image",
            url: "https://warden.example/api/x402/media/generate-image",
            operationId: "media.generateImage",
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
        skill: { fqn: "search.web", title: "search.web" },
        endpoints: [
          {
            method: "POST",
            path: "/search/web",
            url: "https://warden.example/api/x402/search/web",
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
        skill: { fqn: "search.web", title: "search.web" },
        endpoints: [
          {
            method: "POST",
            path: "/search/web",
            url: "https://warden.example/api/x402/search/web",
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

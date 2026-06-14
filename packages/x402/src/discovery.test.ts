import { describe, expect, it } from "vitest";
import { describePayService, discoverPayServices } from "./discovery";

describe("discoverPayServices", () => {
  it("uses the bundled catalog only", async () => {
    const services = await discoverPayServices({
      fetchImpl: async () => {
        throw new Error("remote fetch should not be used");
      },
    });

    expect(services.some((service) => service.fqn === "paysponge/fal")).toBe(true);
    expect(services.some((service) => service.fqn === "unknown/alibaba/aigen")).toBe(
      false,
    );
  });
});

describe("describePayService", () => {
  it("loads endpoint metadata from the local provider file", async () => {
    const skill = await describePayService({
      fqn: "paysponge/fal",
      fetchImpl: async () => {
        throw new Error("remote fetch should not be used");
      },
    });

    expect(skill.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "POST",
          path: "fal-ai/fast-sdxl",
          url: "https://fal.x402.paysponge.com/fal-ai/fast-sdxl",
          operationId: "submitFastSdxl",
          requestSchema: expect.objectContaining({
            required: expect.arrayContaining(["prompt"]),
          }),
        }),
      ]),
    );
  });

  it("uses local OpenAPI server URLs instead of duplicating serviceUrl path prefixes", async () => {
    const skill = await describePayService({
      fqn: "paysponge/coingecko",
      fetchImpl: async () => {
        throw new Error("remote fetch should not be used");
      },
    });

    expect(skill.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "x402/simple/price",
          url: "https://pro-api.coingecko.com/api/v3/x402/simple/price",
        }),
      ]),
    );
  });
});

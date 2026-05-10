import { readdir, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { describePayService } from "./discovery";

interface CatalogIndex {
  serviceCount: number;
  endpointCount: number;
  services: Array<{
    fqn: string;
    endpointCount: number;
    providerFile: string;
    openapiResolved?: boolean;
  }>;
}

interface CatalogProvider {
  fqn: string;
  title: string;
  serviceUrl: string;
  endpoints: Array<{
    method: string;
    path: string;
    url: string;
    summary: string;
  }>;
  documentation: {
    markdown: string;
  };
}

async function readJson<T>(relativePath: string): Promise<T> {
  const contents = await readFile(new URL(`../catalog/${relativePath}`, import.meta.url), "utf8");
  return JSON.parse(contents) as T;
}

describe("static x402 catalog", () => {
  it("contains every provider detail file with documented endpoints", async () => {
    const index = await readJson<CatalogIndex>("index.json");
    const providerFiles = await readdir(
      new URL("../catalog/providers", import.meta.url),
    );

    expect(index.serviceCount).toBe(72);
    expect(providerFiles.filter((file) => file.endsWith(".json"))).toHaveLength(
      index.serviceCount,
    );
    expect(index.endpointCount).toBeGreaterThan(900);

    let endpointCount = 0;
    for (const service of index.services) {
      expect(service.openapiResolved).toBe(true);
      expect(service.endpointCount).toBeGreaterThan(0);

      const provider = await readJson<CatalogProvider>(service.providerFile);
      expect(provider.fqn).toBe(service.fqn);
      expect(provider.title).toBeTruthy();
      expect(provider.serviceUrl).toMatch(/^https:\/\//);
      expect(provider.documentation.markdown.length).toBeGreaterThan(0);
      expect(provider.endpoints).toHaveLength(service.endpointCount);

      for (const endpoint of provider.endpoints) {
        expect(endpoint.method).toMatch(/^(GET|POST|PUT|PATCH|DELETE)$/);
        expect(endpoint.url).toMatch(/^https:\/\//);
        expect(endpoint.summary).toBeTruthy();
      }
      endpointCount += provider.endpoints.length;
    }

    expect(endpointCount).toBe(index.endpointCount);
  });

  it("describes the fal provider from the packaged catalog", async () => {
    const service = await describePayService({ fqn: "paysponge/fal" });

    expect(service.fqn).toBe("paysponge/fal");
    expect(service.operations.length).toBeGreaterThan(0);
    expect(service.operations.some((operation) => operation.url.includes("fal.x402.paysponge.com"))).toBe(true);
  });
});

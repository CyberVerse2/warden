import { WardenError } from "@warden/core";
import { readFile } from "node:fs/promises";
import catalogIndex from "../catalog/index.json" with { type: "json" };

export interface PayCatalogProvider {
  fqn: string;
  title: string;
  description: string;
  useCase?: string;
  category: string;
  serviceUrl: string;
  endpointCount: number;
  hasMetering: boolean;
  hasFreeTier: boolean;
  minPriceUsd: number;
  maxPriceUsd: number;
  sha?: string;
}

export interface PayServiceOperation {
  method: string;
  path: string;
  summary: string;
  url: string;
  operationId?: string;
  parameters?: unknown;
  requestSchema?: unknown;
  responseSchema?: unknown;
  responses?: unknown;
  x402?: unknown;
}

export interface PayServiceDetails extends PayCatalogProvider {
  pageUrl: string;
  operations: PayServiceOperation[];
}

export interface DiscoverPayServicesOptions {
  query?: string;
  limit?: number;
  catalogUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface DescribePayServiceOptions {
  fqn: string;
  catalogUrl?: string;
  fetchImpl?: typeof fetch;
}

interface LocalCatalogIndex {
  services?: Array<{
    fqn?: string;
    title?: string;
    description?: string;
    useCase?: string;
    category?: string;
    serviceUrl?: string;
    endpointCount?: number;
    hasMetering?: boolean;
    hasFreeTier?: boolean;
    minPriceUsd?: number;
    maxPriceUsd?: number;
    sha?: string;
    providerFile?: string;
  }>;
}

function text(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function number(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function bool(v: unknown): boolean {
  return typeof v === "boolean" ? v : false;
}

function normalizeLocalProvider(raw: unknown): PayCatalogProvider | undefined {
  const r = asRecord(raw);
  const fqn = text(r?.fqn);
  const title = text(r?.title);
  const serviceUrl = text(r?.serviceUrl) || text(r?.service_url);
  if (!fqn || !title || !serviceUrl) return undefined;

  return {
    fqn,
    title,
    description: text(r?.description),
    category: text(r?.category),
    serviceUrl,
    endpointCount: number(r?.endpointCount ?? r?.endpoint_count),
    hasMetering: bool(r?.hasMetering ?? r?.has_metering),
    hasFreeTier: bool(r?.hasFreeTier ?? r?.has_free_tier),
    minPriceUsd: number(r?.minPriceUsd ?? r?.min_price_usd),
    maxPriceUsd: number(r?.maxPriceUsd ?? r?.max_price_usd),
    ...(text(r?.useCase ?? r?.use_case)
      ? { useCase: text(r?.useCase ?? r?.use_case) }
      : {}),
    ...(text(r?.sha) ? { sha: text(r?.sha) } : {}),
  };
}

function localCatalogProviders(): PayCatalogProvider[] {
  return ((catalogIndex as LocalCatalogIndex).services ?? [])
    .map(normalizeLocalProvider)
    .filter((provider): provider is PayCatalogProvider => Boolean(provider))
    .sort((a, b) => a.title.localeCompare(b.title));
}

function pageUrlForFqn(fqn: string) {
  return `https://pay.sh/services/${fqn}`;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

async function readLocalProvider(fqn: string) {
  const service = (catalogIndex as LocalCatalogIndex).services?.find(
    (entry) => entry.fqn === fqn,
  );
  if (!service?.providerFile) return undefined;

  try {
    const contents = await readFile(
      new URL(`../catalog/${service.providerFile}`, import.meta.url),
      "utf8",
    );
    return asRecord(JSON.parse(contents));
  } catch (err) {
    throw new WardenError("internal", "Could not read pay.sh catalog provider", {
      fqn,
      providerFile: service.providerFile,
      cause: (err as Error).message,
    });
  }
}

export async function discoverPayServices(
  opts: DiscoverPayServicesOptions = {},
): Promise<PayCatalogProvider[]> {
  const limit =
    opts.limit === undefined ? undefined : Math.max(Math.trunc(opts.limit), 1);
  const providers = localCatalogProviders();
  return limit === undefined ? providers : providers.slice(0, limit);
}

export interface PayCatalogSummary {
  generatedAt: string;
  serviceCount: number;
  endpointCount: number;
  categories: Array<{ category: string; serviceCount: number }>;
  providers: PayCatalogProvider[];
}

/**
 * Synchronous, dependency-free view of the bundled pay.sh catalog. Safe to call
 * from server components and build steps that just need to enumerate the
 * supported x402 services without hitting the network.
 */
export function getPayCatalogSummary(): PayCatalogSummary {
  const providers = localCatalogProviders();
  const counts = new Map<string, number>();
  for (const provider of providers) {
    const category = provider.category || "other";
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  const index = catalogIndex as LocalCatalogIndex & {
    generatedAt?: string;
    serviceCount?: number;
    endpointCount?: number;
  };
  return {
    generatedAt: text(index.generatedAt),
    serviceCount: number(index.serviceCount) || providers.length,
    endpointCount:
      number(index.endpointCount) ||
      providers.reduce((sum, p) => sum + p.endpointCount, 0),
    categories: [...counts.entries()]
      .map(([category, serviceCount]) => ({ category, serviceCount }))
      .sort((a, b) => b.serviceCount - a.serviceCount),
    providers,
  };
}

function urlJoin(base: string, path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

function normalizePath(path: string) {
  return path === "/" ? "" : path.replace(/^\/+/, "");
}

function operationUrl(serviceUrl: string, path: string) {
  const normalized = normalizePath(path);
  if (!normalized) return serviceUrl;
  return urlJoin(baseUrlForOperation(serviceUrl, normalized), normalized);
}

function baseUrlForOperation(serviceUrl: string, path: string) {
  if (!path.startsWith("x402/")) return serviceUrl;
  try {
    const url = new URL(serviceUrl);
    const marker = "/x402/";
    const index = url.pathname.indexOf(marker);
    if (index === -1) return serviceUrl;
    url.pathname = url.pathname.slice(0, index);
    return url.toString().replace(/\/$/, "");
  } catch {
    return serviceUrl;
  }
}

function resolveJsonPointer(root: unknown, pointer: string): unknown {
  if (!pointer.startsWith("#/")) return undefined;
  return pointer
    .slice(2)
    .split("/")
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce<unknown>((current, part) => asRecord(current)?.[part], root);
}

function dereferenceSchema(schema: unknown, root: unknown, seen = new Set<string>()): unknown {
  const record = asRecord(schema);
  if (!record) return schema;
  const ref = text(record.$ref);
  if (ref) {
    if (seen.has(ref)) return schema;
    const resolved = resolveJsonPointer(root, ref);
    if (resolved === undefined) return schema;
    return dereferenceSchema(resolved, root, new Set([...seen, ref]));
  }
  if (Array.isArray(schema)) {
    return schema.map((item) => dereferenceSchema(item, root, seen));
  }
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      dereferenceSchema(value, root, seen),
    ]),
  );
}

function openApiServerUrl(openapi: unknown): string | undefined {
  const root = asRecord(openapi);
  const servers = Array.isArray(root?.servers) ? root.servers : [];
  for (const server of servers) {
    const url = text(asRecord(server)?.url);
    if (/^https?:\/\//i.test(url)) return url;
  }
  return undefined;
}

function operationsFromOpenApi(openapi: unknown, serviceUrl: string): PayServiceOperation[] {
  const root = asRecord(openapi);
  const paths = asRecord(root?.paths);
  if (!paths) return [];
  const baseUrl = openApiServerUrl(openapi) ?? serviceUrl;

  const operations: PayServiceOperation[] = [];
  for (const [path, pathItem] of Object.entries(paths)) {
    const pathRecord = asRecord(pathItem);
    if (!pathRecord) continue;
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      const op = asRecord(pathRecord[method]);
      if (!op) continue;
      const requestBody = asRecord(op.requestBody);
      const content = asRecord(requestBody?.content);
      const jsonContent =
        asRecord(content?.["application/json"]) ??
        asRecord(content?.["application/*+json"]);
      const responses = asRecord(op.responses);
      const successResponse =
        asRecord(responses?.["200"]) ??
        asRecord(responses?.["201"]) ??
        asRecord(responses?.["202"]);
      const successContent = asRecord(successResponse?.content);
      const successJsonContent =
        asRecord(successContent?.["application/json"]) ??
        asRecord(successContent?.["application/*+json"]);

      operations.push({
        method: method.toUpperCase(),
        path: normalizePath(path),
        summary:
          text(op.summary) ||
          text(op.description) ||
          text(op.operationId) ||
          `${method.toUpperCase()} ${path}`,
        url: operationUrl(baseUrl, path),
        ...(text(op.operationId) ? { operationId: text(op.operationId) } : {}),
        ...(Array.isArray(op.parameters) ? { parameters: op.parameters } : {}),
        ...(jsonContent?.schema
          ? { requestSchema: dereferenceSchema(jsonContent.schema, openapi) }
          : {}),
        ...(successJsonContent?.schema
          ? { responseSchema: dereferenceSchema(successJsonContent.schema, openapi) }
          : {}),
        ...(responses ? { responses } : {}),
        ...(Object.keys(op).some((key) => key.startsWith("x-")) ||
        asRecord(op.resource) ||
        Array.isArray(op.accepts)
          ? {
              x402: {
                ...Object.fromEntries(
                  Object.entries(op).filter(([key]) => key.startsWith("x-")),
                ),
                ...(asRecord(op.resource) ? { resource: op.resource } : {}),
                ...(Array.isArray(op.accepts) ? { accepts: op.accepts } : {}),
              },
            }
          : {}),
      });
    }
  }
  return operations;
}

function operationsFromInlineEndpoints(
  endpoints: unknown,
  serviceUrl: string,
): PayServiceOperation[] {
  if (!Array.isArray(endpoints)) return [];
  const operations: PayServiceOperation[] = [];
  for (const endpoint of endpoints) {
      const record = asRecord(endpoint);
    if (!record) continue;
      const method = text(record.method).toUpperCase() || "GET";
      const path = text(record.path) || text(record.url);
    if (!path) continue;
    operations.push({
        method,
        path: normalizePath(path),
        summary:
          text(record.summary) ||
          text(record.description) ||
          `${method} ${path}`,
        url: operationUrl(serviceUrl, path),
        ...(text(record.operationId)
          ? { operationId: text(record.operationId) }
          : {}),
        ...(record.requestSchema ? { requestSchema: record.requestSchema } : {}),
        ...(record.responseSchema ? { responseSchema: record.responseSchema } : {}),
    });
  }
  return operations;
}

export async function describePayService(
  opts: DescribePayServiceOptions,
): Promise<PayServiceDetails> {
  const fqn = opts.fqn.trim();
  if (!fqn) {
    throw new WardenError("internal", "fqn is required");
  }
  const provider =
    localCatalogProviders().find((candidate) => candidate.fqn === fqn) ??
    undefined;
  if (!provider) {
    throw new WardenError("internal", `pay.sh service not found: ${fqn}`);
  }

  const localProvider = await readLocalProvider(fqn);
  const localOpenApi =
    localProvider?.openapi ?? localProvider?.openApi ?? localProvider?.spec;
  const localOperations = operationsFromOpenApi(localOpenApi, provider.serviceUrl);
  const localEndpoints = operationsFromInlineEndpoints(
    localProvider?.endpoints ?? localProvider?.operations,
    provider.serviceUrl,
  );
  const operations = localOperations.length > 0 ? localOperations : localEndpoints;
  return {
    ...provider,
    pageUrl: pageUrlForFqn(fqn),
    operations,
  };
}

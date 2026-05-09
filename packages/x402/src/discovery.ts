import { WardenError } from "@warden/core";

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

export interface DiscoverPayServicesOptions {
  query?: string;
  limit?: number;
  catalogUrl?: string;
  fetchImpl?: typeof fetch;
}

interface PayCatalogResponse {
  providers?: unknown[];
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

function normalizeProvider(raw: unknown): PayCatalogProvider | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const fqn = text(r.fqn);
  const title = text(r.title);
  const serviceUrl = text(r.service_url);
  if (!fqn || !title || !serviceUrl) return undefined;

  return {
    fqn,
    title,
    description: text(r.description),
    category: text(r.category),
    serviceUrl,
    endpointCount: number(r.endpoint_count),
    hasMetering: bool(r.has_metering),
    hasFreeTier: bool(r.has_free_tier),
    minPriceUsd: number(r.min_price_usd),
    maxPriceUsd: number(r.max_price_usd),
    ...(text(r.use_case) ? { useCase: text(r.use_case) } : {}),
    ...(text(r.sha) ? { sha: text(r.sha) } : {}),
  };
}

function scoreProvider(provider: PayCatalogProvider, query: string): number {
  if (!query) return provider.hasMetering ? 2 : 1;
  const haystack = [
    provider.fqn,
    provider.title,
    provider.description,
    provider.useCase,
    provider.category,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  let score = 0;
  for (const term of terms) {
    if (provider.fqn.toLowerCase().includes(term)) score += 5;
    if (provider.title.toLowerCase().includes(term)) score += 4;
    if (provider.category.toLowerCase().includes(term)) score += 3;
    if (haystack.includes(term)) score += 1;
  }
  if (provider.hasMetering) score += 2;
  if (provider.endpointCount > 0) score += 1;
  return score;
}

export async function discoverPayServices(
  opts: DiscoverPayServicesOptions = {},
): Promise<PayCatalogProvider[]> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const catalogUrl = opts.catalogUrl ?? "https://pay.sh/api/catalog";
  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 50);
  const query = opts.query?.trim() ?? "";

  const res = await fetchImpl(catalogUrl, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new WardenError("internal", "pay.sh catalog fetch failed", {
      status: res.status,
      catalogUrl,
    });
  }

  const body = (await res.json()) as PayCatalogResponse;
  const providers = (body.providers ?? [])
    .map(normalizeProvider)
    .filter((p): p is PayCatalogProvider => Boolean(p));

  return providers
    .map((provider) => ({ provider, score: scoreProvider(provider, query) }))
    .filter(({ score }) => !query || score > 0)
    .sort((a, b) => b.score - a.score || a.provider.title.localeCompare(b.provider.title))
    .slice(0, limit)
    .map(({ provider }) => provider);
}

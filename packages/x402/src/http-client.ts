import { createHash } from "node:crypto";
import { WardenError } from "@warden/core";

export interface HttpRequest {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  rawBody: string;
}

export interface FetchLike {
  (input: string, init: RequestInit): Promise<Response>;
}

export function hashRequest(req: HttpRequest): string {
  const canonical = JSON.stringify({
    url: req.url,
    method: req.method.toUpperCase(),
    body: req.body ?? null,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export async function sendRequest(
  req: HttpRequest,
  fetchImpl: FetchLike = fetch,
): Promise<HttpResponse> {
  const init: RequestInit = {
    method: req.method,
    headers: {
      "content-type": "application/json",
      ...(req.headers ?? {}),
    },
    redirect: "manual",
  };
  if (req.body !== undefined) {
    init.body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  }

  let res: Response;
  try {
    res = await fetchImpl(req.url, init);
  } catch (err) {
    throw new WardenError(
      "rpc_failure",
      `Network error fetching ${req.url}: ${(err as Error).message}`,
    );
  }

  // Fail closed on redirects during a paid retry path. Caller decides whether
  // to follow when the request is unpaid; a 3xx on a 402 retry is suspicious.
  if (res.status >= 300 && res.status < 400) {
    throw new WardenError(
      "rpc_failure",
      `Refusing to follow redirect from ${req.url} (status ${res.status})`,
      { location: res.headers.get("location") },
    );
  }

  const rawBody = await res.text();
  let body: unknown = rawBody;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json") && rawBody.length > 0) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      // leave body as raw text
    }
  }

  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => (headers[k] = v));

  return { status: res.status, headers, body, rawBody };
}

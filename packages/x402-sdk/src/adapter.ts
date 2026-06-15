import { Buffer } from "node:buffer";
import type { WardenX402Sdk } from "./sdk";
import type { PaymentQuote } from "./types";

export interface WardenX402HttpAdapterOptions {
  basePath?: string;
}

export async function handleWardenX402Request(
  sdk: WardenX402Sdk,
  request: Request,
  options: WardenX402HttpAdapterOptions = {},
): Promise<Response> {
  const basePath = normalizeBasePath(options.basePath ?? "/x402");
  const url = new URL(request.url);
  const pathname = stripBasePath(url.pathname, basePath);

  if (request.method === "GET" && pathname === "/manifest") {
    return jsonResponse(200, sdk.manifest());
  }

  if (request.method === "GET" && pathname.startsWith("/quote/")) {
    const operationId = decodeURIComponent(pathname.slice("/quote/".length));
    return quoteResponse(sdk.quote(operationId));
  }

  if (request.method === "POST" && pathname === "/quote") {
    const body = (await readJson(request)) as { operationId?: unknown };
    if (typeof body.operationId !== "string") {
      return jsonResponse(400, { error: "operationId is required" });
    }
    return quoteResponse(sdk.quote(body.operationId));
  }

  const operation = sdk
    .manifest()
    .operations.find(
      (candidate) =>
        candidate.path === pathname && candidate.method === request.method,
    );
  if (!operation) {
    return jsonResponse(404, { error: "x402 operation not found" });
  }

  const input = request.method === "GET" ? Object.fromEntries(url.searchParams) : await readJson(request);
  const result = await sdk.execute({
    operationId: operation.id,
    input,
    paymentHeader: paymentHeader(request),
    resourceUrl: request.url,
  });

  if (result.kind === "payment_required") {
    return quoteResponse(result.quote);
  }

  if (result.kind === "denied") {
    return jsonResponse(403, { error: result.reason });
  }

  return jsonResponse(200, {
    output: result.output,
    receipt: result.receipt,
  });
}

function quoteResponse(quote: PaymentQuote): Response {
  const body = JSON.stringify(quote);
  return new Response(body, {
    status: 402,
    headers: {
      "content-type": "application/json",
      "payment-required": Buffer.from(body, "utf8").toString("base64"),
    },
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text) return {};
  return JSON.parse(text);
}

function paymentHeader(request: Request): string | undefined {
  return (
    request.headers.get("payment-signature") ??
    request.headers.get("x-payment") ??
    undefined
  );
}

function normalizeBasePath(basePath: string): string {
  const withSlash = basePath.startsWith("/") ? basePath : `/${basePath}`;
  return withSlash.endsWith("/") && withSlash !== "/"
    ? withSlash.slice(0, -1)
    : withSlash;
}

function stripBasePath(pathname: string, basePath: string): string {
  if (basePath === "/") return pathname;
  if (!pathname.startsWith(basePath)) return pathname;
  const stripped = pathname.slice(basePath.length);
  return stripped.startsWith("/") ? stripped : `/${stripped}`;
}

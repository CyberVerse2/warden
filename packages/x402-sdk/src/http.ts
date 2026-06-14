import type { FetchLike } from "./types";

export async function postJson(
  fetchImpl: FetchLike,
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<unknown> {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
  return readProviderResponse(response, url);
}

export async function getJson(
  fetchImpl: FetchLike,
  url: string,
  headers: Record<string, string>,
): Promise<unknown> {
  const response = await fetchImpl(url, { method: "GET", headers });
  return readProviderResponse(response, url);
}

export async function readProviderResponse(
  response: Response,
  url: string,
): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text();
  if (!response.ok) {
    throw new Error(
      `Provider request failed for ${url}: ${response.status} ${JSON.stringify(body)}`,
    );
  }
  return body;
}

import "server-only";
import { headers } from "next/headers";
import { loadServerEnv } from "./env";

/**
 * Resolve the externally-facing origin of the current request, honoring
 * proxy headers when present. Used to build absolute URLs (e.g. the MCP
 * endpoint) that operators can paste into their agent configs.
 */
export async function getOrigin(): Promise<string> {
  loadServerEnv();
  const configured = process.env.WARDEN_PUBLIC_URL;
  if (configured) return configured.replace(/\/$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) {
    throw new Error("Could not derive Warden origin from request headers");
  }
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https");
  return `${proto}://${host}`.replace(/\/$/, "");
}

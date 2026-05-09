import "server-only";
import { requireEnv } from "./env";

/**
 * Resolve the externally-facing origin of the current request, honoring
 * proxy headers when present. Used to build absolute URLs (e.g. the MCP
 * endpoint) that operators can paste into their agent configs.
 */
export async function getOrigin(): Promise<string> {
  return requireEnv("WARDEN_PUBLIC_URL").replace(/\/$/, "");
}

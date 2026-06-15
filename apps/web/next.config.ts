import type { NextConfig } from "next";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) continue;
    const [, key, rawValue = ""] = match;
    if (key && process.env[key] === undefined) {
      process.env[key] = rawValue.trim().replace(/^['"]|['"]$/g, "");
    }
  }
}

for (const file of [
  resolve(/*turbopackIgnore: true*/ process.cwd(), "../../.env"),
  resolve(/*turbopackIgnore: true*/ process.cwd(), ".env"),
]) {
  loadEnvFile(file);
}

const nextConfig: NextConfig = {
  turbopack: {
    root: resolve(/*turbopackIgnore: true*/ process.cwd(), "../.."),
  },
  outputFileTracingRoot: resolve(
    /*turbopackIgnore: true*/ process.cwd(),
    "../..",
  ),
  outputFileTracingIncludes: {
    "/*": ["../../packages/x402/catalog/**/*"],
  },
  transpilePackages: [
    "@warden/core",
    "@warden/db",
    "@warden/policy",
    "@warden/runtime",
    "@warden/wallet",
    "@warden/x402",
    "@warden/x402-sdk",
  ],
};

export default nextConfig;

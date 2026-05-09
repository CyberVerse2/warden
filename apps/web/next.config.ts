import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@warden/core",
    "@warden/db",
    "@warden/policy",
    "@warden/runtime",
    "@warden/wallet",
  ],
  serverExternalPackages: ["@libsql/client", "libsql"],
  webpack: (config) => {
    config.externals = config.externals || [];
    if (Array.isArray(config.externals)) {
      config.externals.push({
        libsql: "commonjs libsql",
        "@libsql/client": "commonjs @libsql/client",
      });
    }
    config.resolve = config.resolve || {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js", ".jsx"],
    };
    return config;
  },
};

export default nextConfig;

import type { Config } from "drizzle-kit";
import { loadServerEnv } from "@warden/core";

loadServerEnv();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

export default {
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
} satisfies Config;

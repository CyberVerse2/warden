import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema.js";

export type Db = ReturnType<typeof createDb>;

export function createDb(url?: string) {
  const u = url ?? process.env.DATABASE_URL;
  if (!u) {
    throw new Error("DATABASE_URL is required");
  }
  assertSafeDatabaseUrl(u);
  const client = createClient({ url: u });
  return drizzle(client, { schema });
}

function assertSafeDatabaseUrl(url: string) {
  if (!url.startsWith("file:")) return;

  const deployed =
    process.env.VERCEL === "1" ||
    process.env.NETLIFY === "true" ||
    process.env.RENDER === "true" ||
    process.env.RAILWAY_ENVIRONMENT !== undefined ||
    process.env.FLY_APP_NAME !== undefined ||
    process.env.NODE_ENV === "production";

  if (!deployed) return;

  throw new Error(
    "Refusing to use a file: SQLite DATABASE_URL in a deployed/production environment. Use local file: SQLite only for local development, and configure a remote libSQL/Turso DATABASE_URL for shared dev or production.",
  );
}

export * from "./schema.js";
export { schema };

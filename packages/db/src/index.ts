import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema.js";

export type Db = ReturnType<typeof createDb>;

export function createDb(url?: string) {
  const u = url ?? process.env.DATABASE_URL;
  if (!u) {
    throw new Error("DATABASE_URL is required");
  }
  const client = createClient({ url: u });
  return drizzle(client, { schema });
}

export * from "./schema.js";
export { schema };

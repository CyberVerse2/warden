import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>;

export function createDb(url?: string) {
  const u = url ?? process.env.DATABASE_URL;
  if (!u) {
    throw new Error("DATABASE_URL is required");
  }

  const client = postgres(u, { prepare: false });
  return drizzle(client, { schema });
}

export * from "./schema";
export { schema };
export { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";

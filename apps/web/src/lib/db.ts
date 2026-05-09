import { createDb } from "@warden/db";
import { loadServerEnv } from "./env";

let _db: ReturnType<typeof createDb> | undefined;

export function getDb() {
  loadServerEnv();
  if (!_db) _db = createDb(process.env.DATABASE_URL);
  return _db;
}

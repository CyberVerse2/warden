import { createDb } from "@warden/db";

let _db: ReturnType<typeof createDb> | undefined;

export function getDb() {
  if (!_db) _db = createDb(process.env.DATABASE_URL);
  return _db;
}

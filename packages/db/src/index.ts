import { isAbsolute, relative, resolve } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema.js";

export type Db = ReturnType<typeof createDb>;

export function createDb(url?: string) {
  const u = url ?? process.env.DATABASE_URL;
  if (!u) {
    throw new Error("DATABASE_URL is required");
  }
  assertFileDatabaseIsDeploySafe(u);
  const client = createClient({ url: u });
  return drizzle(client, { schema });
}

function assertFileDatabaseIsDeploySafe(url: string) {
  if (!url.startsWith("file:") || url === "file::memory:") return;
  if (!isDeployedRuntime()) return;

  const dbPath = fileDatabasePath(url);
  if (!dbPath || !isAbsolute(dbPath)) {
    throw new Error(
      "Production file: SQLite DATABASE_URL must use an absolute path outside the app folder, for example file:/var/lib/warden/warden.db",
    );
  }

  const appRoot = resolve(process.env.WARDEN_APP_ROOT ?? process.cwd());
  const rel = relative(appRoot, dbPath);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) {
    throw new Error(
      `Production file: SQLite DATABASE_URL points inside the app folder (${appRoot}). Store the database on a persistent data path such as file:/var/lib/warden/warden.db.`,
    );
  }
}

function isDeployedRuntime() {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL === "1" ||
    process.env.NETLIFY === "true" ||
    process.env.RENDER === "true" ||
    process.env.RAILWAY_ENVIRONMENT !== undefined ||
    process.env.FLY_APP_NAME !== undefined
  );
}

function fileDatabasePath(url: string) {
  const raw = url.slice("file:".length);
  if (raw.startsWith("//")) {
    try {
      return new URL(url).pathname;
    } catch {
      return undefined;
    }
  }
  return decodeURIComponent(raw);
}

export * from "./schema.js";
export { schema };

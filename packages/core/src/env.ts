import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function unquote(value: string) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) continue;
    const key = match[1];
    const rawValue = match[2] ?? "";
    if (!key) continue;
    if (process.env[key] === undefined) {
      process.env[key] = unquote(rawValue);
    }
  }
}

export function loadServerEnv() {
  const cwd = process.cwd();
  for (const file of [
    resolve(cwd, ".env"),
    resolve(cwd, ".env.local"),
    resolve(cwd, "../../.env"),
    resolve(cwd, "../../.env.local"),
  ]) {
    loadEnvFile(file);
  }
}

export function requireEnv(name: string): string {
  loadServerEnv();
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

import { afterEach, describe, expect, it, vi } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDb } from "./index.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createDb", () => {
  it("allows file SQLite URLs", () => {
    expect(() => createDb("file::memory:")).not.toThrow();
  });

  it("allows absolute file SQLite URLs outside the app root in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("WARDEN_APP_ROOT", "/srv/warden/app");
    const dbPath = join(tmpdir(), `warden-${Date.now()}.db`);

    expect(() => createDb(`file:${dbPath}`)).not.toThrow();
  });

  it("rejects relative file SQLite URLs in production", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(() => createDb("file:./warden.db")).toThrow(
      /must use an absolute path/,
    );
  });

  it("rejects production file SQLite URLs inside the app root", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("WARDEN_APP_ROOT", "/srv/warden/app");

    expect(() => createDb("file:/srv/warden/app/warden.db")).toThrow(
      /points inside the app folder/,
    );
  });

  it("requires a database URL", () => {
    expect(() => createDb("")).toThrow("DATABASE_URL is required");
  });
});

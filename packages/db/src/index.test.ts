import { afterEach, describe, expect, it, vi } from "vitest";
import { createDb } from "./index.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createDb", () => {
  it("allows file SQLite URLs outside deployed production", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(() => createDb("file::memory:")).not.toThrow();
  });

  it("rejects file SQLite URLs in production", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(() => createDb("file:/tmp/warden.db")).toThrow(
      /Refusing to use a file: SQLite DATABASE_URL/,
    );
  });

  it("rejects file SQLite URLs on Vercel even without NODE_ENV", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL", "1");

    expect(() => createDb("file:/tmp/warden.db")).toThrow(
      /Refusing to use a file: SQLite DATABASE_URL/,
    );
  });
});

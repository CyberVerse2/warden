import { describe, expect, it } from "vitest";
import { createDb } from "./index.js";

describe("createDb", () => {
  it("allows file SQLite URLs", () => {
    expect(() => createDb("file::memory:")).not.toThrow();
  });

  it("requires a database URL", () => {
    expect(() => createDb("")).toThrow("DATABASE_URL is required");
  });
});

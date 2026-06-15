import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadServerEnv } from "./env";

const originalCwd = process.cwd();

describe("loadServerEnv", () => {
  afterEach(() => {
    process.chdir(originalCwd);
    delete process.env.WARDEN_ENV_TEST_EXISTING;
    delete process.env.WARDEN_ENV_TEST_ADDED;
  });

  it("loads newly added env file keys without overriding process env", () => {
    const dir = mkdtempSync(join(tmpdir(), "warden-env-"));
    process.chdir(dir);
    process.env.WARDEN_ENV_TEST_EXISTING = "process";

    writeFileSync(
      join(dir, ".env"),
      "WARDEN_ENV_TEST_EXISTING=file\n",
    );
    loadServerEnv();

    writeFileSync(
      join(dir, ".env"),
      [
        "WARDEN_ENV_TEST_EXISTING=file",
        "WARDEN_ENV_TEST_ADDED=file-added",
        "",
      ].join("\n"),
    );
    loadServerEnv();

    expect(process.env.WARDEN_ENV_TEST_EXISTING).toBe("process");
    expect(process.env.WARDEN_ENV_TEST_ADDED).toBe("file-added");
  });
});

import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./crypto.js";

beforeAll(() => {
  process.env.WARDEN_MASTER_KEY = randomBytes(32).toString("base64");
});

describe("crypto", () => {
  it("round-trips a payload", () => {
    const plaintext = randomBytes(64);
    const enc = encryptSecret(plaintext, "wal_test");
    const dec = decryptSecret(enc, "wal_test");
    expect(dec.equals(plaintext)).toBe(true);
  });

  it("fails when salt differs (HKDF derives different key)", () => {
    const plaintext = randomBytes(32);
    const enc = encryptSecret(plaintext, "wal_a");
    expect(() => decryptSecret(enc, "wal_b")).toThrow();
  });

  it("fails when authTag is tampered with", () => {
    const enc = encryptSecret(randomBytes(32), "wal_t");
    const bad = { ...enc, authTag: Buffer.alloc(16, 0).toString("base64") };
    expect(() => decryptSecret(bad, "wal_t")).toThrow();
  });
});

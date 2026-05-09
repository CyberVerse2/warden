import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";

const KEY_INFO = "warden:wallet:v1";
const ALGO = "aes-256-gcm";

function getMasterKey(): Buffer {
  const raw = process.env.WARDEN_MASTER_KEY;
  if (!raw) {
    throw new Error(
      "WARDEN_MASTER_KEY is not set. Generate one with: openssl rand -base64 32",
    );
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length < 32) {
    throw new Error(
      `WARDEN_MASTER_KEY must decode to >= 32 bytes (got ${buf.length}).`,
    );
  }
  return buf;
}

function deriveKey(salt: string): Buffer {
  const ikm = getMasterKey();
  const derived = hkdfSync("sha256", ikm, Buffer.from(salt), KEY_INFO, 32);
  return Buffer.from(derived);
}

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
}

export function encryptSecret(plaintext: Buffer, salt: string): EncryptedSecret {
  const key = deriveKey(salt);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  key.fill(0);
  return {
    ciphertext: ct.toString("base64"),
    iv: iv.toString("base64"),
    authTag: tag.toString("base64"),
  };
}

export function decryptSecret(secret: EncryptedSecret, salt: string): Buffer {
  const key = deriveKey(salt);
  const decipher = createDecipheriv(
    ALGO,
    key,
    Buffer.from(secret.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(secret.authTag, "base64"));
  const pt = Buffer.concat([
    decipher.update(Buffer.from(secret.ciphertext, "base64")),
    decipher.final(),
  ]);
  key.fill(0);
  return pt;
}

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

/**
 * AES-256-GCM encryption helpers for OAuth tokens at rest.
 *
 * Packed format: "<base64(iv:12 bytes)>:<base64(ciphertext)>:<base64(authTag:16 bytes)>"
 *
 * GCM auth tag detects any tampering with the ciphertext or IV.
 * Random IV per encrypt() call → same plaintext produces different ciphertexts.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function decodeKey(key: string): Buffer {
  const buf = Buffer.from(key, "base64");
  if (buf.length !== KEY_LENGTH) {
    throw new Error(
      `Encryption key must be ${KEY_LENGTH} bytes (got ${buf.length}). Generate with generateKey().`
    );
  }
  return buf;
}

export function encrypt(plaintext: string, key: string): string {
  const keyBuf = decodeKey(key);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, keyBuf, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    ciphertext.toString("base64"),
    authTag.toString("base64"),
  ].join(":");
}

export function decrypt(packed: string, key: string): string {
  const parts = packed.split(":");
  if (parts.length !== 3) {
    throw new Error("Malformed ciphertext: expected iv:ct:tag");
  }
  const iv = Buffer.from(parts[0], "base64");
  const ciphertext = Buffer.from(parts[1], "base64");
  const authTag = Buffer.from(parts[2], "base64");

  if (iv.length !== IV_LENGTH) {
    throw new Error(`Bad IV length: ${iv.length}`);
  }
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error(`Bad auth tag length: ${authTag.length}`);
  }

  const keyBuf = decodeKey(key);
  const decipher = createDecipheriv(ALGORITHM, keyBuf, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

/**
 * Generates a new base64-encoded 32-byte AES key. Use once to mint
 * OAUTH_TOKEN_ENCRYPTION_KEY for an environment.
 */
export function generateKey(): string {
  return randomBytes(KEY_LENGTH).toString("base64");
}

/**
 * Reads the encryption key from the environment. Throws if unset.
 * Centralised so we can swap to Supabase Vault later without touching callers.
 */
export function getEncryptionKey(): string {
  const key = process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      "OAUTH_TOKEN_ENCRYPTION_KEY not set. Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
    );
  }
  return key;
}

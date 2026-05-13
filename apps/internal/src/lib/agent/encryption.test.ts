import { describe, it, expect, beforeAll } from "vitest";
import { encrypt, decrypt, generateKey } from "./encryption";

describe("encryption helpers", () => {
  let key: string;

  beforeAll(() => {
    key = generateKey();
  });

  it("round-trips plaintext through encrypt+decrypt", () => {
    const plaintext = "ya29.a0AfH6SMBxyz_secret_token";
    const ciphertext = encrypt(plaintext, key);
    expect(ciphertext).not.toBe(plaintext);
    expect(ciphertext.split(":").length).toBe(3); // iv:ct:tag
    expect(decrypt(ciphertext, key)).toBe(plaintext);
  });

  it("produces different ciphertexts for the same plaintext (random IV)", () => {
    const plaintext = "hello world";
    const a = encrypt(plaintext, key);
    const b = encrypt(plaintext, key);
    expect(a).not.toBe(b);
    expect(decrypt(a, key)).toBe(plaintext);
    expect(decrypt(b, key)).toBe(plaintext);
  });

  it("throws on decrypt with wrong key", () => {
    const plaintext = "secret";
    const ciphertext = encrypt(plaintext, key);
    const wrongKey = generateKey();
    expect(() => decrypt(ciphertext, wrongKey)).toThrow();
  });

  it("throws on decrypt with tampered ciphertext (auth tag mismatch)", () => {
    const plaintext = "secret";
    const ciphertext = encrypt(plaintext, key);
    const parts = ciphertext.split(":");
    // Flip a bit in the ciphertext segment
    const ctBuf = Buffer.from(parts[1], "base64");
    ctBuf[0] ^= 0xff;
    parts[1] = ctBuf.toString("base64");
    const tampered = parts.join(":");
    expect(() => decrypt(tampered, key)).toThrow();
  });

  it("rejects malformed ciphertext format", () => {
    expect(() => decrypt("not-a-valid-format", key)).toThrow();
    expect(() => decrypt("only:two", key)).toThrow();
  });

  it("rejects keys that aren't 32 bytes", () => {
    const shortKey = Buffer.alloc(16).toString("base64");
    expect(() => encrypt("x", shortKey)).toThrow();
  });

  it("generateKey produces a base64-encoded 32-byte key", () => {
    const k = generateKey();
    expect(Buffer.from(k, "base64").length).toBe(32);
  });
});

import { test, expect, describe } from "bun:test";
import {
  hashPassword,
  verifyPassword,
  generateToken,
  hashToken,
  generateApiKey,
  API_KEY_PREFIX,
} from "../auth/services/crypto.service";
import {
  signAccessToken,
  verifyAccessToken,
} from "../auth/services/jwt.service";

describe("password hashing", () => {
  test("round-trips a correct password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(await verifyPassword("correct-horse-battery-staple", hash)).toBe(true);
  });

  test("rejects a wrong password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  test("uses argon2id", async () => {
    expect(await hashPassword("whatever")).toStartWith("$argon2id$");
  });

  test("salts — the same password hashes differently each time", async () => {
    const a = await hashPassword("same-password-here");
    const b = await hashPassword("same-password-here");
    expect(a).not.toBe(b);
  });

  test("returns false rather than throwing on a malformed hash", async () => {
    expect(await verifyPassword("anything", "not-a-valid-hash")).toBe(false);
  });
});

describe("token generation", () => {
  test("produces unique high-entropy tokens", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateToken()));
    expect(tokens.size).toBe(100);
  });

  test("is url-safe base64", () => {
    expect(generateToken()).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  test("hashing is deterministic and one-way", () => {
    const token = generateToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toBe(token);
    expect(hashToken(token)).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("api keys", () => {
  test("carries the recognisable prefix", () => {
    expect(generateApiKey().plaintext).toStartWith(API_KEY_PREFIX);
  });

  test("stored prefix cannot reconstruct the key", () => {
    const { plaintext, prefix } = generateApiKey();
    expect(plaintext).toStartWith(prefix);
    expect(prefix.length).toBeLessThan(plaintext.length);
  });

  test("hash matches the plaintext it was derived from", () => {
    const { plaintext, hash } = generateApiKey();
    expect(hashToken(plaintext)).toBe(hash);
  });
});

describe("access tokens", () => {
  test("round-trips the user id", async () => {
    const userId = "11111111-1111-1111-1111-111111111111";
    const payload = await verifyAccessToken(await signAccessToken(userId));
    expect(payload?.sub).toBe(userId);
  });

  test("rejects a tampered signature", async () => {
    const token = await signAccessToken("11111111-1111-1111-1111-111111111111");
    const [header, payload, signature] = token.split(".");

    // Flip a character in the middle of the signature. Mutating the LAST
    // base64url character is not reliable: it encodes fewer than 6 significant
    // bits, so several characters decode to identical bytes and the signature
    // would be unchanged.
    const middle = Math.floor(signature!.length / 2);
    const original = signature![middle];
    const flipped = original === "A" ? "B" : "A";
    const tampered = `${header}.${payload}.${signature!.slice(0, middle)}${flipped}${signature!.slice(middle + 1)}`;

    expect(await verifyAccessToken(tampered)).toBeNull();
  });

  test("rejects a tampered payload", async () => {
    const token = await signAccessToken("11111111-1111-1111-1111-111111111111");
    const [header, , signature] = token.split(".");

    const forged = Buffer.from(
      JSON.stringify({
        sub: "22222222-2222-2222-2222-222222222222",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url");

    // Swapping in another user's id must not authenticate as them.
    expect(
      await verifyAccessToken(`${header}.${forged}.${signature}`),
    ).toBeNull();
  });

  test("rejects malformed input rather than throwing", async () => {
    expect(await verifyAccessToken("not.a.jwt")).toBeNull();
    expect(await verifyAccessToken("")).toBeNull();
  });

  test("carries an expiry in the future", async () => {
    const payload = await verifyAccessToken(await signAccessToken("abc"));
    expect(payload!.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });
});

import { createHash, randomBytes, timingSafeEqual } from "crypto";

/**
 * Argon2id via Bun's built-in password hashing — no external dependency.
 * Argon2id is the current recommendation for password storage: memory-hard,
 * so GPU attacks gain far less than they do against bcrypt.
 */
export const hashPassword = (plain: string): Promise<string> =>
  Bun.password.hash(plain, { algorithm: "argon2id" });

/**
 * Bun.password.verify reads the algorithm from the stored hash and is
 * constant-time. Returns false rather than throwing on a malformed hash, so
 * a corrupted row cannot 500 the login route.
 */
export const verifyPassword = async (
  plain: string,
  hash: string,
): Promise<boolean> => {
  try {
    return await Bun.password.verify(plain, hash);
  } catch {
    return false;
  }
};

/**
 * Opaque random tokens for refresh tokens and API keys.
 *
 * base64url of 32 random bytes — 256 bits of entropy, URL-safe, no padding.
 */
export const generateToken = (bytes = 32): string =>
  randomBytes(bytes).toString("base64url");

/**
 * Refresh tokens and API keys are stored as SHA-256 digests, never in
 * plaintext. Unlike passwords these are already high-entropy random values,
 * so a fast hash is appropriate — there is nothing to brute-force, and the
 * lookup happens on every authenticated API request.
 */
export const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

/** Constant-time comparison for hex digests, to avoid leaking via timing. */
export const safeCompare = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
};

/** API key format: discus_sk_<random>. The prefix is stored for display. */
export const API_KEY_PREFIX = "discus_sk_";

export const generateApiKey = (): {
  plaintext: string;
  hash: string;
  prefix: string;
} => {
  const raw = generateToken(32);
  const plaintext = `${API_KEY_PREFIX}${raw}`;
  return {
    plaintext,
    hash: hashToken(plaintext),
    // Enough to identify a key in a list without being able to reconstruct it.
    prefix: plaintext.slice(0, API_KEY_PREFIX.length + 8),
  };
};

import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { db, apiKeys } from "drizzle";
import { eq, and, isNull } from "drizzle-orm";
import { AppError } from "common";
import { verifyAccessToken, ACCESS_COOKIE } from "../services/jwt.service";
import { hashToken, API_KEY_PREFIX } from "../services/crypto.service";

/**
 * Both middlewares set the same `userId` on the context, so route handlers
 * never need to know how the caller authenticated.
 */
export type AuthVariables = {
  userId: string;
  authMethod: "jwt" | "api_key";
};

const extractBearer = (c: Context): string | null => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7).trim() || null;
};

/**
 * Dashboard authentication. Reads the access JWT from an httpOnly cookie,
 * falling back to a bearer header for non-browser clients. Stateless — no
 * database read.
 */
export const requireAuth = async (c: Context, next: Next) => {
  const token = getCookie(c, ACCESS_COOKIE) ?? extractBearer(c);

  if (!token) {
    throw new AppError("Authentication required", 401, "requireAuth");
  }

  const payload = await verifyAccessToken(token);
  if (!payload) {
    throw new AppError("Invalid or expired token", 401, "requireAuth");
  }

  c.set("userId", payload.sub);
  c.set("authMethod", "jwt");
  await next();
};

/**
 * Machine authentication for the public API. Looks up the SHA-256 of the
 * presented key; revoked keys are rejected.
 *
 * This is the reason api_keys is a table rather than a signed token: a leaked
 * key hitting invoice creation is a live incident, and it must be killable
 * immediately rather than at the next expiry.
 */
export const requireApiKey = async (c: Context, next: Next) => {
  const presented = extractBearer(c) ?? c.req.header("X-API-Key") ?? null;

  if (!presented?.startsWith(API_KEY_PREFIX)) {
    throw new AppError("API key required", 401, "requireApiKey");
  }

  const [key] = await db
    .select()
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.keyHash, hashToken(presented)),
        isNull(apiKeys.revokedAt),
      ),
    )
    .limit(1);

  if (!key) {
    throw new AppError("Invalid or revoked API key", 401, "requireApiKey");
  }

  // Fire-and-forget: last_used_at is for the dashboard's benefit and must not
  // add latency or fail the request.
  void db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, key.id))
    .catch((err) => console.error("Failed to update api key last_used_at", err));

  c.set("userId", key.userId);
  c.set("authMethod", "api_key");
  await next();
};

/**
 * Accepts either credential. Used by routes reachable from both the dashboard
 * and the public API.
 */
export const requireAuthOrApiKey = async (c: Context, next: Next) => {
  const hasApiKey =
    extractBearer(c)?.startsWith(API_KEY_PREFIX) || c.req.header("X-API-Key");

  if (hasApiKey) return requireApiKey(c, next);
  return requireAuth(c, next);
};

/** Reads the authenticated user id set by the middleware above. */
export const getUserId = (c: Context): string => {
  const userId = c.get("userId");
  if (!userId) {
    throw new AppError("Missing authentication context", 500, "getUserId");
  }
  return userId;
};

/**
 * Makes c.get("userId") / c.get("authMethod") typed across every route,
 * rather than each handler casting.
 */
declare module "hono" {
  interface ContextVariableMap extends AuthVariables {}
}

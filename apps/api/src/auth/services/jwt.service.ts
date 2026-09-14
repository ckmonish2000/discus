import { sign, verify } from "hono/jwt";
import { env } from "common";

/**
 * Pinned explicitly on both sign and verify. Accepting whatever algorithm a
 * token declares is how algorithm-confusion attacks get in.
 */
const JWT_ALG = "HS256" as const;

export type AccessTokenPayload = {
  sub: string;
  exp: number;
  iat: number;
};

/**
 * Short-lived access token, verified by signature alone — no database read on
 * the request path. Revocation is handled at the refresh boundary: the token
 * expires within ACCESS_TOKEN_TTL, and the refresh token backing it can be
 * revoked in the database, so a compromised session dies within one TTL.
 */
export const signAccessToken = async (userId: string): Promise<string> => {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      sub: userId,
      iat: now,
      exp: now + env.auth.ACCESS_TOKEN_TTL,
    },
    env.auth.JWT_SECRET,
    JWT_ALG,
  );
};

/**
 * Returns the payload, or null for any failure — expired, tampered, wrong
 * secret, malformed. Callers treat null as unauthenticated; distinguishing
 * the reasons would leak information to an attacker.
 */
export const verifyAccessToken = async (
  token: string,
): Promise<AccessTokenPayload | null> => {
  try {
    const payload = (await verify(
      token,
      env.auth.JWT_SECRET,
      JWT_ALG,
    )) as AccessTokenPayload;
    if (!payload?.sub) return null;
    return payload;
  } catch {
    return null;
  }
};

export const ACCESS_COOKIE = "discus_access";
export const REFRESH_COOKIE = "discus_refresh";

/**
 * httpOnly keeps the token out of reach of page JavaScript, which is the
 * main defence against XSS stealing a session. sameSite=lax allows normal
 * top-level navigation while blocking cross-site form posts.
 */
export const cookieOptions = (maxAgeSeconds: number) => ({
  httpOnly: true,
  secure: env.api.NODE_ENV === "production",
  sameSite: "Lax" as const,
  path: "/",
  maxAge: maxAgeSeconds,
});

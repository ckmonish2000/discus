import { db, refreshTokens, users } from "drizzle";
import { eq, and, isNull, gt, sql } from "drizzle-orm";
import { env, AppError } from "common";
import { generateToken, hashToken } from "./crypto.service";
import { signAccessToken } from "./jwt.service";

export type IssuedSession = {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
};

/** Issues an access token plus a fresh refresh token row. */
export const issueSession = async (userId: string): Promise<IssuedSession> => {
  const refreshToken = generateToken();
  const refreshExpiresAt = new Date(
    Date.now() + env.auth.REFRESH_TOKEN_TTL * 1000,
  );

  await db.insert(refreshTokens).values({
    userId,
    tokenHash: hashToken(refreshToken),
    expiresAt: refreshExpiresAt,
  });

  return {
    accessToken: await signAccessToken(userId),
    refreshToken,
    refreshExpiresAt,
  };
};

/**
 * Rotates a refresh token: the presented token is revoked and a replacement
 * issued, in one transaction.
 *
 * Rotation means a stolen refresh token is single-use — once the legitimate
 * client refreshes, the attacker's copy is already revoked (and vice versa,
 * which surfaces as an unexpected logout rather than a silent compromise).
 */
export const rotateSession = async (
  presentedToken: string,
): Promise<IssuedSession> => {
  const presentedHash = hashToken(presentedToken);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.tokenHash, presentedHash),
          isNull(refreshTokens.revokedAt),
          gt(refreshTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new AppError(
        "Invalid or expired refresh token",
        401,
        "rotateSession",
      );
    }

    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.id, existing.id));

    const nextToken = generateToken();
    const nextExpiry = new Date(
      Date.now() + env.auth.REFRESH_TOKEN_TTL * 1000,
    );

    await tx.insert(refreshTokens).values({
      userId: existing.userId,
      tokenHash: hashToken(nextToken),
      expiresAt: nextExpiry,
    });

    return {
      accessToken: await signAccessToken(existing.userId),
      refreshToken: nextToken,
      refreshExpiresAt: nextExpiry,
    };
  });
};

/** Revokes a single refresh token (logout on this device). */
export const revokeSession = async (presentedToken: string): Promise<void> => {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(refreshTokens.tokenHash, hashToken(presentedToken)),
        isNull(refreshTokens.revokedAt),
      ),
    );
};

/** Revokes every active refresh token for a user (log out everywhere). */
export const revokeAllSessions = async (userId: string): Promise<void> => {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(refreshTokens.userId, userId),
        isNull(refreshTokens.revokedAt),
      ),
    );
};

/**
 * Deletes expired and long-revoked rows. Without this the table grows without
 * bound — one row per login per device, forever.
 */
export const pruneExpiredSessions = async (): Promise<number> => {
  const result = await db
    .delete(refreshTokens)
    .where(sql`${refreshTokens.expiresAt} < now() - interval '30 days'`);
  return result.rowCount ?? 0;
};

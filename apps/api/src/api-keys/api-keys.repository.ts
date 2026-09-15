import { db, apiKeys, type Executor } from "drizzle";
import { eq, and, isNull, desc } from "drizzle-orm";

/** Never includes keyHash — key material does not leave this module. */
const safeColumns = {
  id: apiKeys.id,
  name: apiKeys.name,
  prefix: apiKeys.prefix,
  lastUsedAt: apiKeys.lastUsedAt,
  revokedAt: apiKeys.revokedAt,
  createdAt: apiKeys.createdAt,
};

export const apiKeysRepository = {
  async listForUser(userId: string, ex: Executor = db) {
    return ex
      .select(safeColumns)
      .from(apiKeys)
      .where(eq(apiKeys.userId, userId))
      .orderBy(desc(apiKeys.createdAt));
  },

  async create(
    values: { userId: string; name: string; keyHash: string; prefix: string },
    ex: Executor = db,
  ) {
    const [key] = await ex
      .insert(apiKeys)
      .values(values)
      .returning({
        id: apiKeys.id,
        name: apiKeys.name,
        prefix: apiKeys.prefix,
        createdAt: apiKeys.createdAt,
      });

    return key;
  },

  /**
   * Revokes rather than deletes, preserving the audit trail of what the key
   * did while it was live. The isNull guard makes a second revoke a no-op
   * that reports not-found rather than silently succeeding.
   */
  async revoke(id: string, userId: string, ex: Executor = db) {
    const [key] = await ex
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(apiKeys.id, id),
          eq(apiKeys.userId, userId),
          isNull(apiKeys.revokedAt),
        ),
      )
      .returning({ id: apiKeys.id, revokedAt: apiKeys.revokedAt });

    return key;
  },
};

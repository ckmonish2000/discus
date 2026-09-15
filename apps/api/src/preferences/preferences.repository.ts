import { db, preferences, type Executor } from "drizzle";
import { eq, and } from "drizzle-orm";

export type PreferenceValues = {
  value: string | null;
  metadata: Record<string, unknown> | null;
};

const byKey = (userId: string, key: string) =>
  and(eq(preferences.userId, userId), eq(preferences.key, key));

export const preferencesRepository = {
  async listForUser(userId: string, ex: Executor = db) {
    return ex
      .select()
      .from(preferences)
      .where(eq(preferences.userId, userId))
      .orderBy(preferences.key);
  },

  async findByKey(userId: string, key: string, ex: Executor = db) {
    const [pref] = await ex
      .select()
      .from(preferences)
      .where(byKey(userId, key))
      .limit(1);

    return pref;
  },

  /**
   * Upsert on (user_id, key). Preferences are addressed by a key the client
   * already knows, so requiring it to discover whether the row exists first
   * would be pointless round-tripping.
   */
  async upsert(
    userId: string,
    key: string,
    values: PreferenceValues,
    ex: Executor = db,
  ) {
    const [pref] = await ex
      .insert(preferences)
      .values({ userId, key, ...values })
      .onConflictDoUpdate({
        target: [preferences.userId, preferences.key],
        set: { ...values, updatedAt: new Date() },
      })
      .returning();

    return pref;
  },

  async remove(userId: string, key: string, ex: Executor = db) {
    const [pref] = await ex
      .delete(preferences)
      .where(byKey(userId, key))
      .returning({ id: preferences.id });

    return pref;
  },
};

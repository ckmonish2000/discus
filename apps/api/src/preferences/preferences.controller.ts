import { Hono } from "hono";
import { z } from "zod";
import { db, preferences } from "drizzle";
import { eq, and } from "drizzle-orm";
import { validate } from "common";
import { requireAuth, getUserId } from "../auth/middleware/auth.middleware";
import { requireOwned, ok } from "../shared/crud.helpers";

const upsertPreferenceSchema = z.object({
  value: z.string().max(10_000).nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
});

const router = new Hono();
router.use("*", requireAuth);

/** GET /preferences */
router.get("/", async (c) => {
  const items = await db
    .select()
    .from(preferences)
    .where(eq(preferences.userId, getUserId(c)))
    .orderBy(preferences.key);

  return c.json(ok(items));
});

/** GET /preferences/:key */
router.get("/:key", async (c) => {
  const [pref] = await db
    .select()
    .from(preferences)
    .where(
      and(
        eq(preferences.userId, getUserId(c)),
        eq(preferences.key, c.req.param("key")),
      ),
    )
    .limit(1);

  return c.json(ok(requireOwned(pref, "Preference", "getPreference")));
});

/**
 * PUT /preferences/:key
 *
 * Upsert rather than separate create/update: preferences are addressed by a
 * key the client already knows, so requiring it to discover whether the row
 * exists first would be pointless round-tripping.
 */
router.put("/:key", validate("json", upsertPreferenceSchema), async (c) => {
  const userId = getUserId(c);
  const key = c.req.param("key");
  const { value, metadata } = c.req.valid("json");

  const [pref] = await db
    .insert(preferences)
    .values({
      userId,
      key,
      value: value ?? null,
      metadata: metadata ?? null,
    })
    .onConflictDoUpdate({
      target: [preferences.userId, preferences.key],
      set: {
        value: value ?? null,
        metadata: metadata ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  return c.json(ok(pref));
});

/** DELETE /preferences/:key */
router.delete("/:key", async (c) => {
  const [pref] = await db
    .delete(preferences)
    .where(
      and(
        eq(preferences.userId, getUserId(c)),
        eq(preferences.key, c.req.param("key")),
      ),
    )
    .returning({ id: preferences.id });

  requireOwned(pref, "Preference", "deletePreference");
  return c.json(ok({ deleted: true }));
});

export default router;

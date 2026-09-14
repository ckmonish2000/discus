import { Hono } from "hono";
import { z } from "zod";
import { db, apiKeys } from "drizzle";
import { eq, and, isNull, desc } from "drizzle-orm";
import { validate, AppError } from "common";
import { requireAuth, getUserId } from "../auth/middleware/auth.middleware";
import { requireOwned, ok } from "../shared/crud.helpers";
import { generateApiKey } from "../auth/services/crypto.service";

const createKeySchema = z.object({
  name: z.string().min(1).max(200),
});

const router = new Hono();
// Deliberately session-only: an API key must not be able to mint further API
// keys, which would make revoking a leaked key insufficient to contain it.
router.use("*", requireAuth);

/** GET /api-keys — never returns key material. */
router.get("/", async (c) => {
  const items = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.userId, getUserId(c)))
    .orderBy(desc(apiKeys.createdAt));

  return c.json(ok(items));
});

/**
 * POST /api-keys
 *
 * The plaintext key is returned exactly once, here. Only its SHA-256 is
 * stored, so it cannot be recovered afterwards — a lost key must be revoked
 * and replaced.
 */
router.post("/", validate("json", createKeySchema), async (c) => {
  const userId = getUserId(c);
  const { name } = c.req.valid("json");
  const { plaintext, hash, prefix } = generateApiKey();

  const [key] = await db
    .insert(apiKeys)
    .values({ userId, name, keyHash: hash, prefix })
    .returning({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      createdAt: apiKeys.createdAt,
    });

  if (!key) {
    throw new AppError("Failed to create API key", 500, "createApiKey");
  }

  return c.json(
    ok({
      ...key,
      key: plaintext,
      warning: "Store this key now — it cannot be retrieved again.",
    }),
    201,
  );
});

/**
 * DELETE /api-keys/:id — revokes rather than deletes, preserving the audit
 * trail of what the key did while it was live.
 */
router.delete("/:id", async (c) => {
  const [key] = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(apiKeys.id, c.req.param("id")),
        eq(apiKeys.userId, getUserId(c)),
        isNull(apiKeys.revokedAt),
      ),
    )
    .returning({ id: apiKeys.id, revokedAt: apiKeys.revokedAt });

  requireOwned(key, "API key", "revokeApiKey");
  return c.json(ok(key));
});

export default router;

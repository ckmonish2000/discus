import { Hono } from "hono";
import { validate, upsertPreferenceSchema } from "common";
import { requireAuth, getUserId } from "../auth/middleware/auth.middleware";
import { ok } from "../shared/crud.helpers";
import { preferencesService } from "./preferences.service";

const router = new Hono();
router.use("*", requireAuth);

/** GET /preferences */
router.get("/", async (c) =>
  c.json(ok(await preferencesService.list(getUserId(c)))),
);

/** GET /preferences/:key */
router.get("/:key", async (c) =>
  c.json(
    ok(await preferencesService.getByKey(getUserId(c), c.req.param("key"))),
  ),
);

/** PUT /preferences/:key — upsert, since the client already knows the key. */
router.put("/:key", validate("json", upsertPreferenceSchema), async (c) =>
  c.json(
    ok(
      await preferencesService.upsert(
        getUserId(c),
        c.req.param("key"),
        c.req.valid("json"),
      ),
    ),
  ),
);

/** DELETE /preferences/:key */
router.delete("/:key", async (c) => {
  await preferencesService.remove(getUserId(c), c.req.param("key"));
  return c.json(ok({ deleted: true }));
});

export default router;

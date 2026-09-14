import { Hono } from "hono";
import { validate, createFormatSchema, updateFormatSchema } from "common";
import { requireAuth, getUserId } from "../auth/middleware/auth.middleware";
import { ok } from "../shared/crud.helpers";
import { formatsService } from "./formats.service";

const router = new Hono();
router.use("*", requireAuth);

/** GET /formats */
router.get("/", async (c) => c.json(ok(await formatsService.list(getUserId(c)))));

/**
 * GET /formats/template — the built-in starting point.
 *
 * Identical for everyone; it is behind requireAuth only because the whole
 * router is. Declared before /:id so "template" is not read as an id.
 */
router.get("/template", (c) => c.json(ok(formatsService.template())));

/** GET /formats/:id */
router.get("/:id", async (c) =>
  c.json(ok(await formatsService.getById(c.req.param("id"), getUserId(c)))),
);

/** POST /formats */
router.post("/", validate("json", createFormatSchema), async (c) =>
  c.json(ok(await formatsService.create(getUserId(c), c.req.valid("json"))), 201),
);

/** POST /formats/seed-default — idempotent. */
router.post("/seed-default", async (c) => {
  const { format, created } = await formatsService.seedDefault(getUserId(c));
  return c.json(ok(format), created ? 201 : 200);
});

/** PATCH /formats/:id */
router.patch("/:id", validate("json", updateFormatSchema), async (c) =>
  c.json(
    ok(
      await formatsService.update(
        c.req.param("id"),
        getUserId(c),
        c.req.valid("json"),
      ),
    ),
  ),
);

/** DELETE /formats/:id */
router.delete("/:id", async (c) => {
  await formatsService.remove(c.req.param("id"), getUserId(c));
  return c.json(ok({ deleted: true }));
});

export default router;

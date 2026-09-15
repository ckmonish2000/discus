import { Hono } from "hono";
import {
  validate,
  createVendorSchema,
  updateVendorSchema,
  listVendorsSchema,
} from "common";
import { requireAuth, getUserId } from "../auth/middleware/auth.middleware";
import { ok, okList } from "../shared/crud.helpers";
import { vendorsService } from "./vendors.service";

const router = new Hono();
router.use("*", requireAuth);

/** GET /vendors */
router.get("/", validate("query", listVendorsSchema), async (c) => {
  const q = c.req.valid("query");
  const { items, total } = await vendorsService.list(getUserId(c), q);

  return c.json(okList(items, total, { limit: q.limit, offset: q.offset }));
});

/** GET /vendors/:id */
router.get("/:id", async (c) =>
  c.json(ok(await vendorsService.getById(c.req.param("id"), getUserId(c)))),
);

/** POST /vendors */
router.post("/", validate("json", createVendorSchema), async (c) =>
  c.json(ok(await vendorsService.create(getUserId(c), c.req.valid("json"))), 201),
);

/** PATCH /vendors/:id */
router.patch("/:id", validate("json", updateVendorSchema), async (c) =>
  c.json(
    ok(
      await vendorsService.update(
        c.req.param("id"),
        getUserId(c),
        c.req.valid("json"),
      ),
    ),
  ),
);

/** DELETE /vendors/:id — invoices keep their history via ON DELETE SET NULL. */
router.delete("/:id", async (c) => {
  await vendorsService.remove(c.req.param("id"), getUserId(c));
  return c.json(ok({ deleted: true }));
});

export default router;

import { Hono } from "hono";
import { validate, createApiKeySchema } from "common";
import { requireAuth, getUserId } from "../auth/middleware/auth.middleware";
import { ok } from "../shared/crud.helpers";
import { apiKeysService } from "./api-keys.service";

const router = new Hono();
// Deliberately session-only: an API key must not be able to mint further API
// keys, which would make revoking a leaked key insufficient to contain it.
router.use("*", requireAuth);

/** GET /api-keys — never returns key material. */
router.get("/", async (c) => c.json(ok(await apiKeysService.list(getUserId(c)))));

/** POST /api-keys — the only time the plaintext key is ever returned. */
router.post("/", validate("json", createApiKeySchema), async (c) =>
  c.json(ok(await apiKeysService.create(getUserId(c), c.req.valid("json"))), 201),
);

/** DELETE /api-keys/:id — revokes, preserving the audit trail. */
router.delete("/:id", async (c) =>
  c.json(ok(await apiKeysService.revoke(c.req.param("id"), getUserId(c)))),
);

export default router;

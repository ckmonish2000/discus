import { Hono } from "hono";
import { validate, createDocumentSchema, listDocumentsSchema } from "common";
import { requireAuth, getUserId } from "../auth/middleware/auth.middleware";
import { ok, okList } from "../shared/crud.helpers";
import { serializeDocument } from "../shared/serializers";
import { documentsService } from "./documents.service";

const router = new Hono();
router.use("*", requireAuth);

/** GET /documents — full-text search over summary and OCR text. */
router.get("/", validate("query", listDocumentsSchema), async (c) => {
  const q = c.req.valid("query");
  const { items, total } = await documentsService.list(getUserId(c), q);

  // sizeBytes is a BigInt column; JSON.stringify cannot serialize it.
  return c.json(
    okList(items.map(serializeDocument), total, {
      limit: q.limit,
      offset: q.offset,
    }),
  );
});

/** GET /documents/:id — includes full OCR text. */
router.get("/:id", async (c) => {
  const doc = await documentsService.getById(c.req.param("id"), getUserId(c));
  return c.json(ok(serializeDocument(doc)));
});

/** POST /documents — registers an uploaded object. Idempotent. */
router.post("/", validate("json", createDocumentSchema), async (c) => {
  const { document, created } = await documentsService.register(
    getUserId(c),
    c.req.valid("json"),
  );

  return c.json(ok(serializeDocument(document)), created ? 201 : 200);
});

/** DELETE /documents/:id — invoices survive via ON DELETE SET NULL. */
router.delete("/:id", async (c) => {
  await documentsService.remove(c.req.param("id"), getUserId(c));
  return c.json(ok({ deleted: true }));
});

export default router;

import { Hono } from "hono";
import { z } from "zod";
import { db, documents } from "drizzle";
import { eq, and, desc, sql, type SQL } from "drizzle-orm";
import { validate, AppError } from "common";
import { requireAuth, getUserId } from "../auth/middleware/auth.middleware";
import {
  paginationSchema,
  requireOwned,
  ok,
  okList,
} from "../shared/crud.helpers";
import { serializeDocument } from "../shared/serializers";

const createDocumentSchema = z.object({
  bucketName: z.string().min(1).max(200),
  objectPath: z.string().min(1).max(2000),
  originalFilename: z.string().max(500).nullish(),
  mimeType: z.string().min(1).max(200),
  sizeBytes: z.number().int().nonnegative().nullish(),
});

const listQuerySchema = paginationSchema.extend({
  status: z.enum(["pending", "processing", "completed", "failed"]).optional(),
  search: z.string().min(1).optional(),
});

const router = new Hono();
router.use("*", requireAuth);

/** GET /documents — full-text search over summary and OCR text. */
router.get("/", validate("query", listQuerySchema), async (c) => {
  const userId = getUserId(c);
  const { limit, offset, status, search } = c.req.valid("query");

  const filters: SQL[] = [eq(documents.userId, userId)];
  if (status) filters.push(eq(documents.status, status));
  if (search) {
    // Matches the expression the GIN index is built on.
    filters.push(
      sql`to_tsvector('english', coalesce(${documents.summary}, '') || ' ' || coalesce(${documents.ocrText}, '')) @@ plainto_tsquery('english', ${search})`,
    );
  }

  const where = and(...filters);

  const [items, [counted]] = await Promise.all([
    db
      .select({
        id: documents.id,
        bucketName: documents.bucketName,
        objectPath: documents.objectPath,
        originalFilename: documents.originalFilename,
        mimeType: documents.mimeType,
        sizeBytes: documents.sizeBytes,
        status: documents.status,
        summary: documents.summary,
        errorMessage: documents.errorMessage,
        processedAt: documents.processedAt,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .where(where)
      .orderBy(desc(documents.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(documents).where(where),
  ]);

  return c.json(okList(items, counted?.count ?? 0, { limit, offset }));
});

/** GET /documents/:id — includes full OCR text. */
router.get("/:id", async (c) => {
  const [doc] = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.id, c.req.param("id")),
        eq(documents.userId, getUserId(c)),
      ),
    )
    .limit(1);

  return c.json(ok(serializeDocument(requireOwned(doc, "Document", "getDocument"))));
});

/**
 * POST /documents — registers an uploaded object.
 *
 * The (bucket_name, object_path) unique index makes this idempotent: a repeat
 * registration for the same object returns the existing row rather than
 * creating a duplicate.
 */
router.post("/", validate("json", createDocumentSchema), async (c) => {
  const userId = getUserId(c);
  const body = c.req.valid("json");

  const [doc] = await db
    .insert(documents)
    .values({
      userId,
      bucketName: body.bucketName,
      objectPath: body.objectPath,
      originalFilename: body.originalFilename ?? null,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes ? BigInt(body.sizeBytes) : null,
    })
    .onConflictDoNothing()
    .returning();

  if (doc) return c.json(ok(serializeDocument(doc)), 201);

  const [existing] = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.bucketName, body.bucketName),
        eq(documents.objectPath, body.objectPath),
        eq(documents.userId, userId),
      ),
    )
    .limit(1);

  // The object exists but belongs to someone else.
  if (!existing) {
    throw new AppError(
      "That object is already registered",
      409,
      "createDocument",
    );
  }

  return c.json(ok(serializeDocument(existing)));
});

/** DELETE /documents/:id — invoices survive via ON DELETE SET NULL. */
router.delete("/:id", async (c) => {
  const [doc] = await db
    .delete(documents)
    .where(
      and(
        eq(documents.id, c.req.param("id")),
        eq(documents.userId, getUserId(c)),
      ),
    )
    .returning({ id: documents.id });

  requireOwned(doc, "Document", "deleteDocument");
  return c.json(ok({ deleted: true }));
});

export default router;

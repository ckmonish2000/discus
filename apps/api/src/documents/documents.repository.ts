import { db, documents, type Executor } from "drizzle";
import { eq, and, desc, sql, type SQL } from "drizzle-orm";
import type { CreateDocumentDto, ListDocumentsDto } from "common";

/** List projection: everything except the full OCR text, which can be large. */
const listColumns = {
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
};

const scoped = (userId: string, id: string) =>
  and(eq(documents.id, id), eq(documents.userId, userId));

export const documentsRepository = {
  async list(userId: string, q: ListDocumentsDto, ex: Executor = db) {
    const filters: SQL[] = [eq(documents.userId, userId)];
    if (q.status) filters.push(eq(documents.status, q.status));
    if (q.search) {
      // Matches the expression the GIN index is built on.
      filters.push(
        sql`to_tsvector('english', coalesce(${documents.summary}, '') || ' ' || coalesce(${documents.ocrText}, '')) @@ plainto_tsquery('english', ${q.search})`,
      );
    }

    const where = and(...filters);

    const [items, [counted]] = await Promise.all([
      ex
        .select(listColumns)
        .from(documents)
        .where(where)
        .orderBy(desc(documents.createdAt))
        .limit(q.limit)
        .offset(q.offset),
      ex
        .select({ count: sql<number>`count(*)::int` })
        .from(documents)
        .where(where),
    ]);

    return { items, total: counted?.count ?? 0 };
  },

  /** Full row, including OCR text. */
  async findById(id: string, userId: string, ex: Executor = db) {
    const [doc] = await ex
      .select()
      .from(documents)
      .where(scoped(userId, id))
      .limit(1);

    return doc;
  },

  async findByObject(
    bucketName: string,
    objectPath: string,
    userId: string,
    ex: Executor = db,
  ) {
    const [doc] = await ex
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.bucketName, bucketName),
          eq(documents.objectPath, objectPath),
          eq(documents.userId, userId),
        ),
      )
      .limit(1);

    return doc;
  },

  /**
   * Returns undefined when the (bucket_name, object_path) unique index
   * rejects the insert — the service then decides whether that is the caller's
   * own prior registration or somebody else's object.
   */
  async create(userId: string, values: CreateDocumentDto, ex: Executor = db) {
    const [doc] = await ex
      .insert(documents)
      .values({
        userId,
        bucketName: values.bucketName,
        objectPath: values.objectPath,
        originalFilename: values.originalFilename ?? null,
        mimeType: values.mimeType,
        sizeBytes: values.sizeBytes ? BigInt(values.sizeBytes) : null,
      })
      .onConflictDoNothing()
      .returning();

    return doc;
  },

  /** Invoices survive via ON DELETE SET NULL. */
  async remove(id: string, userId: string, ex: Executor = db) {
    const [doc] = await ex
      .delete(documents)
      .where(scoped(userId, id))
      .returning({ id: documents.id });

    return doc;
  },
};

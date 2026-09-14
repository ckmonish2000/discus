import {
  pgTable,
  uuid,
  text,
  timestamp,
  bigint,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { users } from "./users";
import { invoices } from "./invoices";
import { documentStatusEnum } from "./enums";

/**
 * A document is an uploaded file in MinIO plus whatever the pipeline has
 * derived from it. `ocrText` holds the raw extraction; `summary` holds a
 * short generated description used for search and for listing documents
 * without loading full OCR text.
 */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bucketName: text("bucket_name").notNull(),
    objectPath: text("object_path").notNull(),
    originalFilename: text("original_filename"),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "bigint" }),
    status: documentStatusEnum("status").notNull().default("pending"),
    ocrText: text("ocr_text"),
    summary: text("summary"),
    errorMessage: text("error_message"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("documents_user_idx").on(table.userId),
    index("documents_status_idx").on(table.userId, table.status),
    // Real idempotency, replacing the in-process hashMap in the existing
    // workers (which used a 60ms window, was per-process, and never evicted).
    // A duplicate MinIO webhook for the same object now conflicts at the DB.
    uniqueIndex("documents_object_idx").on(table.bucketName, table.objectPath),
    // Full-text search across the generated summary and the OCR text.
    index("documents_fts_idx").using(
      "gin",
      sql`to_tsvector('english', coalesce(${table.summary}, '') || ' ' || coalesce(${table.ocrText}, ''))`,
    ),
  ],
);

export const documentsRelations = relations(documents, ({ one, many }) => ({
  user: one(users, { fields: [documents.userId], references: [users.id] }),
  invoices: many(invoices),
}));

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;

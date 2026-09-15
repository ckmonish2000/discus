import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { users } from "./users";

/** Core invoice columns a user-defined field can be mapped onto. */
export type CoreField =
  | "invoiceNumber"
  | "poNumber"
  | "issueDate"
  | "dueDate"
  | "currency"
  | "subtotal"
  | "taxTotal"
  | "discount"
  | "total"
  | "paymentTerms"
  | "vendorName"
  | "vendorTaxId"
  | "vendorEmail"
  | "vendorAddress"
  | "lineItems";

/**
 * Maps a field in the user's JSON Schema onto a core column. Fields with no
 * mapping fall through to invoices.data, which keeps them queryable via the
 * GIN index without polluting the typed columns.
 */
export type FieldMapping = Record<string, CoreField | null>;

/**
 * A format is one definition serving two purposes: it is the JSON Schema
 * handed to the LLM for structured output, and it is the mapping that tells
 * the persistence layer where each extracted field belongs. Keeping them as
 * one record is what prevents the extraction shape and the storage shape
 * from drifting apart.
 */
export const invoiceFormats = pgTable(
  "invoice_formats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    /** JSON Schema describing the extraction output. */
    schema: jsonb("schema").$type<Record<string, unknown>>().notNull(),
    /** Schema field path -> core column, or null to keep it in data. */
    fieldMapping: jsonb("field_mapping").$type<FieldMapping>().notNull().default({}),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("invoice_formats_user_idx").on(table.userId),
    // At most one default per user, enforced in the database rather than in
    // application code.
    uniqueIndex("invoice_formats_one_default_idx")
      .on(table.userId)
      .where(sql`${table.isDefault}`),
  ],
);

export const invoiceFormatsRelations = relations(invoiceFormats, ({ one }) => ({
  user: one(users, { fields: [invoiceFormats.userId], references: [users.id] }),
}));

export type InvoiceFormat = typeof invoiceFormats.$inferSelect;
export type NewInvoiceFormat = typeof invoiceFormats.$inferInsert;

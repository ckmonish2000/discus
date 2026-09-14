import {
  pgTable,
  uuid,
  text,
  timestamp,
  bigint,
  date,
  char,
  real,
  boolean,
  jsonb,
  integer,
  numeric,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { vendors } from "./vendors";
import { documents } from "./documents";
import { invoiceStatusEnum, invoiceSourceEnum } from "./enums";

/**
 * Core invoice fields are real typed columns so they stay queryable across
 * every user regardless of that user's custom extraction format. Anything
 * format-specific (cost centres, project codes, approval fields) falls
 * through to `data`.
 *
 * Money is BIGINT minor units paired with `currency`; see packages/common
 * money helpers. Never store amounts as floats.
 */
export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    documentId: uuid("document_id").references(() => documents.id, {
      onDelete: "set null",
    }),
    vendorId: uuid("vendor_id").references(() => vendors.id, {
      onDelete: "set null",
    }),

    invoiceNumber: text("invoice_number"),
    poNumber: text("po_number"),
    issueDate: date("issue_date"),
    dueDate: date("due_date"),

    currency: char("currency", { length: 3 }).notNull().default("USD"),
    subtotalMinor: bigint("subtotal_minor", { mode: "bigint" }),
    taxTotalMinor: bigint("tax_total_minor", { mode: "bigint" }),
    discountMinor: bigint("discount_minor", { mode: "bigint" }),
    totalMinor: bigint("total_minor", { mode: "bigint" }),

    status: invoiceStatusEnum("status").notNull().default("draft"),
    paymentTerms: text("payment_terms"),

    /** Extraction confidence 0..1. Null for manually entered invoices. */
    confidence: real("confidence"),
    needsReview: boolean("needs_review").notNull().default(false),

    /** Format-specific fields that have no core column. */
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),

    source: invoiceSourceEnum("source").notNull().default("dashboard"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("invoices_user_idx").on(table.userId),
    index("invoices_user_issue_date_idx").on(table.userId, table.issueDate),
    index("invoices_user_status_idx").on(table.userId, table.status),
    index("invoices_user_vendor_idx").on(table.userId, table.vendorId),
    index("invoices_review_idx").on(table.userId, table.needsReview),
    // Keeps custom per-format fields queryable despite living in JSONB.
    index("invoices_data_idx").using("gin", table.data),
  ],
);

/**
 * Line items are rows rather than a JSONB array because they are the most
 * queried entity in the system — "spend on consulting across all invoices",
 * "every line over $5k" are trivial as SQL and painful as JSON.
 */
export const lineItems = pgTable(
  "line_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),

    /** Order on the original document. SQL rows have no inherent order. */
    position: integer("position").notNull().default(0),

    description: text("description"),
    /** Fractional units are common (3.5 hours), so numeric rather than int. */
    quantity: numeric("quantity", { precision: 12, scale: 3 }),
    unitPriceMinor: bigint("unit_price_minor", { mode: "bigint" }),
    /**
     * Stored as printed on the invoice, not computed from quantity x price.
     * The invoice is the record; a mismatch against the computed value is a
     * needs_review signal (bad OCR, or an unstated per-line discount).
     */
    lineTotalMinor: bigint("line_total_minor", { mode: "bigint" }),
    /** Percentage, e.g. 20.00 for 20% VAT. */
    taxRate: numeric("tax_rate", { precision: 5, scale: 2 }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("line_items_invoice_idx").on(table.invoiceId, table.position)],
);

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  user: one(users, { fields: [invoices.userId], references: [users.id] }),
  vendor: one(vendors, {
    fields: [invoices.vendorId],
    references: [vendors.id],
  }),
  document: one(documents, {
    fields: [invoices.documentId],
    references: [documents.id],
  }),
  lineItems: many(lineItems),
}));

export const lineItemsRelations = relations(lineItems, ({ one }) => ({
  invoice: one(invoices, {
    fields: [lineItems.invoiceId],
    references: [invoices.id],
  }),
}));

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type LineItem = typeof lineItems.$inferSelect;
export type NewLineItem = typeof lineItems.$inferInsert;

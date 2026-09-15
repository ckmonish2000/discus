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
  index,
} from "drizzle-orm/pg-core";
import { users } from "../users";
import { vendors } from "../vendors";
import { documents } from "../documents";
import { invoiceStatusEnum, invoiceSourceEnum } from "../enums";

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

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;

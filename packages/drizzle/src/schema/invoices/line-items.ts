import {
  pgTable,
  uuid,
  text,
  timestamp,
  bigint,
  integer,
  numeric,
  index,
} from "drizzle-orm/pg-core";
import { invoices } from "./invoices";

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

export type LineItem = typeof lineItems.$inferSelect;
export type NewLineItem = typeof lineItems.$inferInsert;

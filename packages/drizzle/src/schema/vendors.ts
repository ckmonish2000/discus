import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { users } from "./users";
import { invoices } from "./invoices";

export type BankDetails = {
  accountName?: string;
  accountNumber?: string;
  iban?: string;
  swift?: string;
  bankName?: string;
  routingNumber?: string;
};

/**
 * Vendors are separate from invoices because the relationship is many-to-one:
 * fifty invoices from one supplier should reference one vendor row, not carry
 * fifty copies of its address. This is what makes per-vendor spend analytics
 * and "all invoices from X" possible.
 *
 * Bank details live here rather than on the invoice — they are a property of
 * who you pay, and they repeat across every invoice from that vendor.
 */
export const vendors = pgTable(
  "vendors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    taxId: text("tax_id"),
    email: text("email"),
    phone: text("phone"),
    address: text("address"),
    bankDetails: jsonb("bank_details").$type<BankDetails>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("vendors_user_idx").on(table.userId),
    // Upsert target during extraction. tax_id is nullable, so coalesce to a
    // sentinel — NULLs are not equal to each other in a unique index, which
    // would otherwise let duplicate vendors accumulate.
    uniqueIndex("vendors_user_name_tax_idx").on(
      table.userId,
      sql`lower(${table.name})`,
      sql`coalesce(${table.taxId}, '')`,
    ),
  ],
);

export const vendorsRelations = relations(vendors, ({ one, many }) => ({
  user: one(users, { fields: [vendors.userId], references: [users.id] }),
  invoices: many(invoices),
}));

export type Vendor = typeof vendors.$inferSelect;
export type NewVendor = typeof vendors.$inferInsert;

import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

/**
 * Key-value settings per user, with a JSONB field for structured extras.
 *
 * This is also where buyer identity lives. The buyer on an invoice is almost
 * always the account holder, so a dedicated table would have one row per user
 * and buy nothing — it is account configuration, not invoice data.
 *
 * Well-known keys:
 *   buyer.identity   -> metadata: { name, address, taxId, email }
 *   extraction.hints -> metadata: { notes, vendorAliases, ... }
 *   locale           -> value: "en-US"
 *   defaultCurrency  -> value: "USD"
 */
export const preferences = pgTable(
  "preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("preferences_user_key_idx").on(table.userId, table.key),
  ],
);

export const preferencesRelations = relations(preferences, ({ one }) => ({
  user: one(users, { fields: [preferences.userId], references: [users.id] }),
}));

export type Preference = typeof preferences.$inferSelect;
export type NewPreference = typeof preferences.$inferInsert;

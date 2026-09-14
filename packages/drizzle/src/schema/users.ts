import { pgTable, uuid, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { documents } from "./documents";
import { invoices } from "./invoices";
import { vendors } from "./vendors";
import { preferences } from "./preferences";
import { invoiceFormats } from "./invoice-formats";
import { apiKeys, refreshTokens } from "./auth";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Unique on lower(email) rather than using citext — avoids requiring a
    // Postgres extension. All lookups normalise to lowercase first.
    uniqueIndex("users_email_lower_idx").on(sql`lower(${table.email})`),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  documents: many(documents),
  invoices: many(invoices),
  vendors: many(vendors),
  preferences: many(preferences),
  invoiceFormats: many(invoiceFormats),
  apiKeys: many(apiKeys),
  refreshTokens: many(refreshTokens),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

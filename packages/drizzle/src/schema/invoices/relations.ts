import { relations } from "drizzle-orm";
import { users } from "../users";
import { vendors } from "../vendors";
import { documents } from "../documents";
import { invoices } from "./invoices";
import { lineItems } from "./line-items";

/**
 * Relations live apart from the table definitions: they reference both tables
 * in this folder, so declaring them alongside either one would create a
 * circular import between the two table modules.
 */
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

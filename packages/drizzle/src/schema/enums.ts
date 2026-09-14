import { pgEnum } from "drizzle-orm/pg-core";

export const documentStatusEnum = pgEnum("document_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "pending",
  "approved",
  "paid",
  "void",
]);

/** How the invoice entered the system — dashboard entry, public API, or extraction. */
export const invoiceSourceEnum = pgEnum("invoice_source", [
  "dashboard",
  "api",
  "extraction",
]);

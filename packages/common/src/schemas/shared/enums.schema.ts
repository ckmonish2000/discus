import { z } from "zod";

/**
 * Enum values mirrored from packages/drizzle schema/enums.ts.
 *
 * They are redeclared rather than imported because `common` must not depend on
 * `drizzle` — the web app imports these schemas and has no database client.
 * The arrays are `as const` so any drift shows up as a type error where a
 * repository maps one onto a Drizzle column.
 */
export const INVOICE_STATUSES = [
  "draft",
  "pending",
  "approved",
  "paid",
  "void",
] as const;

export const DOCUMENT_STATUSES = [
  "pending",
  "processing",
  "completed",
  "failed",
] as const;

export const INVOICE_SOURCES = ["dashboard", "api", "extraction"] as const;

export const invoiceStatusSchema = z.enum(INVOICE_STATUSES);
export const documentStatusSchema = z.enum(DOCUMENT_STATUSES);
export const invoiceSourceSchema = z.enum(INVOICE_SOURCES);

export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;
export type DocumentStatus = z.infer<typeof documentStatusSchema>;
export type InvoiceSource = z.infer<typeof invoiceSourceSchema>;

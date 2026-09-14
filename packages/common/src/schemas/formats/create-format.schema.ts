import { z } from "zod";

/**
 * The invoice fields a user's custom format may map onto. Anything not in this
 * list lands in the invoice's JSONB `data` column instead of a typed column.
 */
export const CORE_FIELDS = [
  "invoiceNumber",
  "poNumber",
  "issueDate",
  "dueDate",
  "currency",
  "subtotal",
  "taxTotal",
  "discount",
  "total",
  "paymentTerms",
  "vendorName",
  "vendorTaxId",
  "vendorEmail",
  "vendorAddress",
  "lineItems",
] as const;

export const coreFieldSchema = z.enum(CORE_FIELDS);

export const createFormatSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  schema: z.record(z.string(), z.unknown()),
  /** Maps a field name in the user's format onto a core field, or null. */
  fieldMapping: z.record(z.string(), coreFieldSchema.nullable()).default({}),
  isDefault: z.boolean().default(false),
});

export type CoreField = z.infer<typeof coreFieldSchema>;
export type CreateFormatDto = z.infer<typeof createFormatSchema>;

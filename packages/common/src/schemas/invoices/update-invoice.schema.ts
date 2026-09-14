import { z } from "zod";
import { createInvoiceSchema } from "./create-invoice.schema";

/**
 * Every field optional. `lineItems` being present at all means "replace the
 * whole set"; absent means "leave them alone" — the service distinguishes
 * those two cases with an `undefined` check, so the nullish/optional
 * difference matters here.
 */
export const updateInvoiceSchema = createInvoiceSchema.partial();

export type UpdateInvoiceDto = z.infer<typeof updateInvoiceSchema>;

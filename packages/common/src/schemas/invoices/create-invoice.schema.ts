import { z } from "zod";
import { invoiceStatusSchema } from "../shared/enums.schema";
import { lineItemSchema } from "./line-item.schema";

export const createInvoiceSchema = z.object({
  vendorId: z.string().uuid().nullish(),
  documentId: z.string().uuid().nullish(),
  invoiceNumber: z.string().max(200).nullish(),
  poNumber: z.string().max(200).nullish(),
  issueDate: z.string().date().nullish(),
  dueDate: z.string().date().nullish(),
  currency: z.string().length(3).default("USD"),
  subtotal: z.number().nullish(),
  taxTotal: z.number().nullish(),
  discount: z.number().nullish(),
  total: z.number().nullish(),
  status: invoiceStatusSchema.default("draft"),
  paymentTerms: z.string().max(1000).nullish(),
  data: z.record(z.string(), z.unknown()).default({}),
  lineItems: z.array(lineItemSchema).default([]),
});

export type CreateInvoiceDto = z.infer<typeof createInvoiceSchema>;

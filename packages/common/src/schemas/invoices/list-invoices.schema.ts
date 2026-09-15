import { z } from "zod";
import { paginationSchema } from "../shared/pagination.schema";
import { invoiceStatusSchema } from "../shared/enums.schema";

export const listInvoicesSchema = paginationSchema.extend({
  status: invoiceStatusSchema.optional(),
  vendorId: z.string().uuid().optional(),
  /** Query strings carry no booleans, so this arrives as text. */
  needsReview: z.enum(["true", "false"]).optional(),
  issuedAfter: z.string().date().optional(),
  issuedBefore: z.string().date().optional(),
});

export type ListInvoicesDto = z.infer<typeof listInvoicesSchema>;

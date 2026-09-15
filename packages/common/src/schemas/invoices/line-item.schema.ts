import { z } from "zod";

/**
 * Amounts arrive as decimals (19.99) and are converted to minor units on the
 * way in, so the currency must be known before any amount is parsed. That
 * conversion belongs to the service layer, not here.
 */
export const lineItemSchema = z.object({
  description: z.string().max(2000).nullish(),
  quantity: z.number().nullish(),
  unitPrice: z.number().nullish(),
  lineTotal: z.number().nullish(),
  taxRate: z.number().min(0).max(100).nullish(),
});

export type LineItemDto = z.infer<typeof lineItemSchema>;

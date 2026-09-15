import { z } from "zod";

export const bankDetailsSchema = z
  .object({
    accountName: z.string().optional(),
    accountNumber: z.string().optional(),
    iban: z.string().optional(),
    swift: z.string().optional(),
    bankName: z.string().optional(),
    routingNumber: z.string().optional(),
  })
  .optional();

export const createVendorSchema = z.object({
  name: z.string().min(1).max(500),
  taxId: z.string().max(100).nullish(),
  email: z.email().nullish(),
  phone: z.string().max(50).nullish(),
  address: z.string().max(2000).nullish(),
  bankDetails: bankDetailsSchema,
});

export type BankDetailsDto = z.infer<typeof bankDetailsSchema>;
export type CreateVendorDto = z.infer<typeof createVendorSchema>;

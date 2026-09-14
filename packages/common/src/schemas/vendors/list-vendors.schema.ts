import { z } from "zod";
import { paginationSchema } from "../shared/pagination.schema";

export const listVendorsSchema = paginationSchema.extend({
  search: z.string().optional(),
});

export type ListVendorsDto = z.infer<typeof listVendorsSchema>;

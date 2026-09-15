import { z } from "zod";
import { paginationSchema } from "../shared/pagination.schema";
import { documentStatusSchema } from "../shared/enums.schema";

export const listDocumentsSchema = paginationSchema.extend({
  status: documentStatusSchema.optional(),
  /** Full-text search over summary and OCR text. */
  search: z.string().min(1).optional(),
});

export type ListDocumentsDto = z.infer<typeof listDocumentsSchema>;

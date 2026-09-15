import { z } from "zod";

/**
 * Standard list query. Cursor-free offset pagination is adequate here —
 * invoice lists are user-scoped and small.
 */
export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export type Pagination = z.infer<typeof paginationSchema>;

export const uuidParam = z.string().uuid("Invalid id");

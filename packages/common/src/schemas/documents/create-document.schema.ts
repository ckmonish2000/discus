import { z } from "zod";

export const createDocumentSchema = z.object({
  bucketName: z.string().min(1).max(200),
  objectPath: z.string().min(1).max(2000),
  originalFilename: z.string().max(500).nullish(),
  mimeType: z.string().min(1).max(200),
  sizeBytes: z.number().int().nonnegative().nullish(),
});

export type CreateDocumentDto = z.infer<typeof createDocumentSchema>;

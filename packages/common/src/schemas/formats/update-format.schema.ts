import { z } from "zod";
import { createFormatSchema } from "./create-format.schema";

export const updateFormatSchema = createFormatSchema.partial();

export type UpdateFormatDto = z.infer<typeof updateFormatSchema>;

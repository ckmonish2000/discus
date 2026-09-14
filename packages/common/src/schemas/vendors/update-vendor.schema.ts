import { z } from "zod";
import { createVendorSchema } from "./create-vendor.schema";

export const updateVendorSchema = createVendorSchema.partial();

export type UpdateVendorDto = z.infer<typeof updateVendorSchema>;

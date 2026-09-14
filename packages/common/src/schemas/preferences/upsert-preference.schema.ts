import { z } from "zod";

export const upsertPreferenceSchema = z.object({
  value: z.string().max(10_000).nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
});

export type UpsertPreferenceDto = z.infer<typeof upsertPreferenceSchema>;

import { z } from "zod";

/**
 * Email is lowercased and trimmed at the edge so the uniqueness check, the
 * login lookup and the stored value all agree on one canonical form.
 */
export const signupSchema = z.object({
  email: z.email().transform((v) => v.toLowerCase().trim()),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters")
    .max(256, "Password must be at most 256 characters"),
});

export type SignupDto = z.infer<typeof signupSchema>;

import { z } from "zod";

/**
 * No minimum length beyond "present": rejecting a short password here with a
 * different message than a wrong one would leak whether the account exists.
 */
export const loginSchema = z.object({
  email: z.email().transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1, "Password is required"),
});

export type LoginDto = z.infer<typeof loginSchema>;

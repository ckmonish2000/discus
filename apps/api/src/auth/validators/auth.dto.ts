import { z } from "zod";
import { validate } from "common";

export const signupSchema = z.object({
  email: z.email().transform((v) => v.toLowerCase().trim()),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters")
    .max(256, "Password must be at most 256 characters"),
});

export const loginSchema = z.object({
  email: z.email().transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1, "Password is required"),
});

export type SignupDto = z.infer<typeof signupSchema>;
export type LoginDto = z.infer<typeof loginSchema>;

export const signupValidator = validate("json", signupSchema);
export const loginValidator = validate("json", loginSchema);

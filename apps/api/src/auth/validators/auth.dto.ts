import { validate, signupSchema, loginSchema } from "common";

/**
 * The schemas themselves live in packages/common/src/schemas/auth so the web
 * app can validate a signup form against the same rules the API enforces.
 * Only the Hono middleware bindings stay here.
 */
export { signupSchema, loginSchema };
export type { SignupDto, LoginDto } from "common";

export const signupValidator = validate("json", signupSchema);
export const loginValidator = validate("json", loginSchema);

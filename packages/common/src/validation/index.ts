import { zValidator } from "@hono/zod-validator";
import type { ZodType, z } from "zod";
import type { ValidationTargets, MiddlewareHandler, Env } from "hono";

/**
 * Thin wrapper over zValidator.
 *
 * @hono/zod-validator still types its schema parameter against Zod v3's
 * ZodSchema. This project is on Zod v4, whose ZodObject no longer structurally
 * matches that type, so every direct zValidator call fails to typecheck even
 * though it works correctly at runtime.
 *
 * The cast is confined here rather than repeated at each call site, so when
 * the upstream types catch up there is exactly one place to remove it.
 */
export const validate = <
  Target extends keyof ValidationTargets,
  T extends ZodType,
>(
  target: Target,
  schema: T,
) =>
  zValidator(target as never, schema as never) as unknown as MiddlewareHandler<
    Env,
    string,
    { in: { [K in Target]: z.input<T> }; out: { [K in Target]: z.output<T> } }
  >;

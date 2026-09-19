import { AppError } from "../error-types/app-error";
import type { ErrorHandler } from "hono";
/**
 * Hono throws HTTPException for framework-level rejections — a malformed JSON
 * body being the common one. Those carry a real status (400) that must reach
 * the client, or the response blames the server for the caller's bad request.
 *
 * Detected by shape rather than `instanceof`: this package resolves its own
 * copy of hono, so the class identity here differs from the one apps/api
 * throws and `instanceof` silently never matches.
 */
const isHttpException = (err: unknown): err is Error & { status: number } => {
  if (!(err instanceof Error)) return false;

  // Read `status` through unknown: once the guard above narrows err to Error,
  // casting straight to { status: number } is rejected as non-overlapping.
  const status = (err as unknown as { status?: unknown }).status;
  return typeof status === "number" && status >= 400 && status <= 599;
};

export const errorHandler: ErrorHandler = (err, c) => {
  if (isHttpException(err)) {
    console.warn(`[http] ${err.status} ${err.message}`);

    return c.json(
      {
        success: false,
        message: err.message || "Bad request",
        status: err.status,
      },
      err.status as any,
    );
  }

  if (err instanceof AppError) {
    // Client errors are expected; log them at a lower volume than failures.
    if (err.statusCode >= 500) {
      console.error(`[${err.operation}] ${err.message}`, {
        originalError: err.originalError,
        context: err.context,
      });
    } else {
      console.warn(`[${err.operation}] ${err.statusCode} ${err.message}`);
    }

    return c.json(
      {
        success: false,
        message: err.message,
        status: err.statusCode,
      },
      err.statusCode as any,
    );
  }

  // Unexpected throw. The response stays generic so internals are not leaked
  // to the caller, but it must be logged in full or 500s are undebuggable.
  console.error("Unhandled error:", err);

  return c.json(
    {
      success: false,
      message: "Internal server error",
      status: 500,
    },
    500,
  );
};

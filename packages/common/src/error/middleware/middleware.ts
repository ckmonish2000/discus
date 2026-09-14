import { AppError } from "../error-types/app-error";
import type { ErrorHandler } from "hono";

export const errorHandler: ErrorHandler = (err, c) => {
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

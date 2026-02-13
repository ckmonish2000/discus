import { AppError } from "../error-types/app-error";
import type { ErrorHandler } from "hono";

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof AppError) {
    return c.json(
      {
        success: false,
        message: err.message,
        status: err.statusCode,
      },
      err.statusCode as any,
    );
  }
  return c.json(
    {
      success: false,
      message: "Internal server error",
      status: 500,
    },
    500,
  );
};

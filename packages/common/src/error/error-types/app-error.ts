export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly operation: string,
    public readonly originalError?: any,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
    Error.captureStackTrace(this, this.constructor);
  }
}

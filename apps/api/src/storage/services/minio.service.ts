import MinioService from "minio";
import { env } from "common";
/**
 * Singleton MinioService instance configured from environment variables.
 * This instance is shared across all storage routes to ensure consistent
 * configuration and efficient resource usage.
 */
const isDevelopment = env.NODE_ENV === "development";
export const minioService = new MinioService({
  useSSL: !isDevelopment,
  endpoint: env.MINIO_BASE_URL,
  accessKey: env.MINIO_ACCESS_KEY,
  secretKey: env.MINIO_SECRET_KEY,
});

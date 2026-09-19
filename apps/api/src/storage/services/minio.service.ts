import MinioService from "minio";
import { env } from "common";
/**
 * Singleton MinioService instance configured from environment variables.
 * This instance is shared across all storage routes to ensure consistent
 * configuration and efficient resource usage.
 */
/**
 * TLS is decided by the endpoint's own scheme, not by NODE_ENV. `bun test`
 * forces NODE_ENV=test regardless of what .env.local says, which flipped this
 * to HTTPS and made every MinIO call in a test fail against a plain-HTTP dev
 * server. The URL already states which protocol it wants.
 */
export const minioService = new MinioService({
  useSSL: env.minio.MINIO_BASE_URL.startsWith("https://"),
  endpoint: env.minio.MINIO_BASE_URL,
  accessKey: env.minio.MINIO_ACCESS_KEY,
  secretKey: env.minio.MINIO_SECRET_KEY,
});

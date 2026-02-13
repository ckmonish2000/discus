import MinioService from "minio";
import { env } from "common";
/**
 * Singleton MinioService instance configured from environment variables.
 * This instance is shared across all storage routes to ensure consistent
 * configuration and efficient resource usage.
 */
const isDevelopment = env.api.NODE_ENV === 'development';
export const minioService = new MinioService({
    useSSL: isDevelopment,
    endpoint: env.minio.MINIO_BASE_URL,
    accessKey: env.minio.MINIO_ACCESS_KEY,
    secretKey: env.minio.MINIO_SECRET_KEY,
});

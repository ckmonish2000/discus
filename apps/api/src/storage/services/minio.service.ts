import MinioService from "minio";

/**
 * Singleton MinioService instance configured from environment variables.
 * This instance is shared across all storage routes to ensure consistent
 * configuration and efficient resource usage.
 */
export const minioService = new MinioService({
    useSSL: false,
    endpoint: process.env.MINIO_BASE_URL!,
    accessKey: process.env.MINIO_ACCESS_KEY!,
    secretKey: process.env.MINIO_SECRET_KEY!,
});

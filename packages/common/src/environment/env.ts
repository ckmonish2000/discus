export default {
  minio: {
    MINIO_ROOT_USER: process.env.MINIO_ROOT_USER,
    MINIO_ROOT_PASSWORD: process.env.MINIO_ROOT_PASSWORD,
    MINIO_NOTIFY_WEBHOOK_ENABLE_primary:
      process.env.MINIO_NOTIFY_WEBHOOK_ENABLE_primary,
    MINIO_NOTIFY_WEBHOOK_ENDPOINT_primary:
      process.env.MINIO_NOTIFY_WEBHOOK_ENDPOINT_primary,
    MINIO_BASE_URL: process.env.MINIO_BASE_URL,
    MINIO_PUBLIC_URL: process.env.MINIO_PUBLIC_URL,
    MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY,
    MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY,
    MINIO_REGION: process.env.MINIO_REGION,
    EXPIRES_IN: process.env.EXPIRES_IN,
  },
  redis: {
    REDIS_HOST: process.env.REDIS_HOST,
    REDIS_PORT: process.env.REDIS_PORT,
    REDIS_PASSWORD: process.env.REDIS_PASSWORD,
  },
  llm: {
    MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
    LLM_MODEL: process.env.LLM_MODEL,
    OLLAMA_HOST: process.env.OLLAMA_HOST,
  },
  api: {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
  },
};

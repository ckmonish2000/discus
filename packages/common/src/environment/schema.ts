import z from "zod";

export const envSchema = z.object({
  minio: z.object({
    MINIO_ROOT_USER: z.string().nonempty(),
    MINIO_ROOT_PASSWORD: z.string().nonempty(),
    MINIO_NOTIFY_WEBHOOK_ENABLE_primary: z.string().nonempty(),
    MINIO_NOTIFY_WEBHOOK_ENDPOINT_primary: z.string().nonempty(),
    MINIO_BASE_URL: z.string().nonempty(),
    MINIO_PUBLIC_URL: z.string().nonempty(),
    MINIO_ACCESS_KEY: z.string().nonempty(),
    MINIO_SECRET_KEY: z.string().nonempty(),
    MINIO_REGION: z.string().nonempty(),
    EXPIRES_IN: z
      .string()
      .regex(/^\d+$/, "PORT must be a number")
      .transform((val) => parseInt(val, 10)),
  }),
  llm: z.object({
    MISTRAL_API_KEY: z.string().nonempty(),
    LLM_MODEL: z.string().nonempty(),
    OLLAMA_HOST: z.string().nonempty(),
  }),
  api: z.object({
    NODE_ENV: z.enum(["development", "production", "test"]),
    PORT: z
      .string()
      .regex(/^\d+$/, "PORT must be a number")
      .transform((val) => parseInt(val, 10)),
  }),
  redis: z.object({
    REDIS_HOST: z.string().nonempty(),
    REDIS_PORT: z.string().nonempty(),
    REDIS_PASSWORD: z.string().nonempty(),
  }),
});

export type Env = z.infer<typeof envSchema>;

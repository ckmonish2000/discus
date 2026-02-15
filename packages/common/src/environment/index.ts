import enviroment from "./env";
import { envSchema } from "./schema";

export type Env = typeof enviroment;

export function loadEnv() {
  const parsed = envSchema.safeParse(enviroment);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}

export const env = loadEnv();

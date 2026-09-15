import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

config({ path: "../../.env.local" });

/**
 * drizzle-kit always runs on the host, never inside a container, so it needs
 * the published port rather than the compose service name. DATABASE_URL is
 * container-shaped (db:5432) for the api service; DATABASE_URL_HOST carries
 * the localhost:5433 equivalent for tooling like this.
 */
const url = process.env.DATABASE_URL_HOST ?? process.env.DATABASE_URL;

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: url!,
  },
  verbose: true,
  strict: true,
});

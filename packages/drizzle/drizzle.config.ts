import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// Only present when running on the host; inside the migrate container the
// variables arrive through env_file and this call is a harmless no-op.
config({ path: "../../.env.local" });

/**
 * Two callers with two different views of the database:
 *
 *   - On the host, drizzle-kit reaches Postgres through the published port,
 *     so it needs DATABASE_URL_HOST (localhost:5433).
 *   - In the migrate service it is on the compose network, where the host
 *     port does not exist and DATABASE_URL (db:5432) is the correct address.
 *
 * IN_CONTAINER is set by the migrate service. Preferring DATABASE_URL_HOST
 * unconditionally would send the container to its own loopback.
 */
const url =
  process.env.IN_CONTAINER === "true"
    ? process.env.DATABASE_URL
    : (process.env.DATABASE_URL_HOST ?? process.env.DATABASE_URL);

if (!url) {
  throw new Error(
    "No database URL. Set DATABASE_URL_HOST (host) or DATABASE_URL (container).",
  );
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  verbose: true,
  strict: true,
});

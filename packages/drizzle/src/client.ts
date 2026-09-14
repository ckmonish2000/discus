import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "common";
import * as schema from "./schema";

/**
 * Shared connection pool. Postgres connections are expensive, so the pool is
 * created once per process and reused across requests and jobs.
 */
const pool = new Pool({
  connectionString: env.db.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on("error", (err) => {
  console.error("Unexpected postgres pool error:", err);
});

export const db = drizzle(pool, { schema });

export type Database = typeof db;

export const closeDbConnection = async () => {
  await pool.end();
};

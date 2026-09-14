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

/**
 * The transaction handle `db.transaction()` hands its callback.
 *
 * Repository methods take `Executor` rather than `Database` so a service can
 * compose several repository calls inside one transaction — see the invoice
 * service, which writes an invoice and its line items atomically.
 */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Either the pool or an open transaction. */
export type Executor = Database | Transaction;

export const closeDbConnection = async () => {
  await pool.end();
};

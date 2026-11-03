import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const databaseUrl = process.env.TARGET_DATABASE_URL ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: databaseUrl,
  // Cloudflare Workers starts many short-lived isolates. A default 10-connection
  // pg Pool PER isolate can exhaust Neon and make login/session writes return 500.
  // Bound per-isolate connections and timeouts without changing Render's pool.
  ...(process.env.CF_WORKER_RUNTIME === "1"
    ? { max: 2, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 7_000, allowExitOnIdle: true }
    : process.env.VERCEL === "1"
      ? { max: 3, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 5_000, allowExitOnIdle: true }
      : {}),
});
export const db = drizzle(pool, { schema });

export * from "./schema";

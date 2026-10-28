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
  ...(process.env.CF_WORKER_RUNTIME === "1"
    // Cloudflare forbids reusing a TCP connection made during a prior request.
    // maxUses:1 removes every pg client on release, including after a transaction.
    // Keep Render's existing pool behavior completely unchanged.
    ? { max: 3, maxUses: 1, idleTimeoutMillis: 1_000, connectionTimeoutMillis: 8_000, allowExitOnIdle: true }
    : process.env.VERCEL === "1"
      ? { max: 3, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 5_000, allowExitOnIdle: true }
      : {}),
});
export const db = drizzle(pool, { schema });

export * from "./schema";

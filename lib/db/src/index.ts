import { AsyncLocalStorage } from "node:async_hooks";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const databaseUrl = process.env.TARGET_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

// Worker isolates serve requests in separate I/O contexts. PostgreSQL socket
// connections acquired during request A must never be reused in request B.
// Cloudflare Hyperdrive documentation explicitly requires a fresh database
// client per request. This does not change the Neon schema or credentials.
const isCloudflare = process.env.CF_WORKER_RUNTIME === "1";
const databaseOptions = isCloudflare
  ? {
      connectionString: databaseUrl,
      max: 3,
      idleTimeoutMillis: 1_000,
      connectionTimeoutMillis: 8_000,
      query_timeout: 12_000,
      allowExitOnIdle: true,
    }
  : {
      connectionString: databaseUrl,
      ...(process.env.VERCEL === "1"
        ? { max: 3, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 5_000, allowExitOnIdle: true }
        : {}),
    };

type PgPool = InstanceType<typeof Pool>;
type RequestDatabaseScope = { pool: PgPool; disposed: boolean };
const requestScope = new AsyncLocalStorage<RequestDatabaseScope>();

function freshRequestPool(): PgPool {
  const p = new Pool(databaseOptions);
  // Idle client errors are handled rather than crashing the whole Worker.
  p.on("error", (error) => console.error("Gavhah database idle connection error", error.name));
  return p;
}

/** Run the Express request from its first middleware through all session,
 * repository and transaction operations in one isolated PostgreSQL context.
 * The scope is not shared with other Cloudflare requests.
 */
export function runWithRequestDatabase<T>(callback: () => T): T {
  if (!isCloudflare) return callback();
  return requestScope.run({ pool: freshRequestPool(), disposed: false }, callback);
}

/** Called at response finish/close. Idempotent and never affects another
 * request's database connections. No migrations or table writes here.
 */
export function closeRequestDatabase(): void {
  if (!isCloudflare) return;
  const current = requestScope.getStore();
  if (!current || current.disposed) return;
  current.disposed = true;
  void current.pool.end().catch(error => {
    console.error("Gavhah database request connection cleanup failed", error?.name || "error");
  });
}

const rootPool = new Pool(databaseOptions);
if (isCloudflare) rootPool.on("error", (error) => console.error("Gavhah database fallback pool error", error.name));

// Keep the exported Pool interface required by Drizzle and Express session
// store, while dispatching *every* query/connect to the active request pool.
// The function must choose the pool when CALLED, not when Drizzle captures it.
export const pool: PgPool = isCloudflare
  ? new Proxy(rootPool, {
      get(target, prop) {
        if (prop === "query" || prop === "connect") {
          return (...args: unknown[]) => {
            const active = requestScope.getStore();
            if (!active || active.disposed) {
              throw new Error("Cloudflare database access must run in an active request scope");
            }
            const fn = Reflect.get(active.pool, prop, active.pool) as (...values: unknown[]) => unknown;
            return Reflect.apply(fn, active.pool, args);
          };
        }
        const property = Reflect.get(target, prop, target);
        return typeof property === "function" ? property.bind(target) : property;
      },
    })
  : rootPool;

export const db = drizzle(pool, { schema });
export * from "./schema";

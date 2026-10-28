import { drizzle } from "drizzle-orm/node-postgres";
import { AsyncLocalStorage } from "node:async_hooks";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;
const databaseUrl = process.env.TARGET_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

const cloudflareRuntime = process.env.CF_WORKER_RUNTIME === "1";
const scopedPool = new AsyncLocalStorage<pg.Pool>();
const cloudflareOptions = {
  connectionString: databaseUrl,
  max: 4,
  maxUses: 1,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 1_000,
  allowExitOnIdle: true,
};

// Render/Vercel retain their original shared pg Pool behavior.
export const pool = new Pool(cloudflareRuntime ? cloudflareOptions : {
  connectionString: databaseUrl,
  ...(process.env.VERCEL === "1"
    ? { max: 3, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 5_000, allowExitOnIdle: true }
    : {}),
});

// All real connections in Cloudflare are created only inside Express request
// context. pg and Drizzle keep the same Pool instance/interface, but queries
// never touch the globally created pool's sockets.
if (cloudflareRuntime) {
  const getActive = (): pg.Pool => {
    const active = scopedPool.getStore();
    if (!active) throw new Error("Missing Cloudflare request database context");
    return active;
  };
  const shared = pool as unknown as {
    query: (...args: any[]) => any;
    connect: (...args: any[]) => any;
  };
  shared.query = (...args: any[]) => (getActive().query as any)(...args);
  shared.connect = (...args: any[]) => (getActive().connect as any)(...args);
}

export function runWithCloudflareDatabaseRequest<T>(callback: (requestPool?: pg.Pool) => T): T {
  if (!cloudflareRuntime) return callback();
  const requestPool = new Pool(cloudflareOptions);
  requestPool.on("error", () => {
    // Never log a raw connection error: it may include infrastructure details.
    console.error(JSON.stringify({ event: "gavhah.db.idle_error", at: new Date().toISOString() }));
  });
  return scopedPool.run(requestPool, () => callback(requestPool));
}
export const db = drizzle(pool, { schema });
export * from "./schema";

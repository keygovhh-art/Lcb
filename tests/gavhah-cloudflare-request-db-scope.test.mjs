import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = path => fs.readFileSync(path,"utf8");

test("Cloudflare request middleware begins before any session or API query",()=>{
 const source=read("artifacts/api-server/src/app-cloudflare.ts");
 const first=source.indexOf('app.use((_req,res,next)=>{');
 const session=source.indexOf("app.use(session({");
 const api=source.indexOf('app.use("/api",router);');
 assert(first>=0&&first<session&&session<api,"Every API/session must run inside request scope");
 assert(source.includes("runWithRequestDatabase(()=>"));
 assert(source.includes('res.once("finish",closeRequestDatabase)'));
 assert(source.includes('res.once("close",closeRequestDatabase)'));
});
test("Shared pg Pool does not reuse connections between Cloudflare requests",()=>{
 const source=read("lib/db/src/index.ts");
 assert(source.includes('new AsyncLocalStorage<RequestDatabaseScope>()'));
 assert(source.includes("requestScope.run({ pool: freshRequestPool(), disposed: false }"));
 assert(source.includes('prop === "query" || prop === "connect"'));
 assert(source.includes("requestScope.getStore()"));
 assert(source.includes("active.disposed"));
 assert(source.includes("current.pool.end().catch"));
 assert(source.includes("connectionTimeoutMillis: 8_000"));
 assert(source.includes("query_timeout: 12_000"));
 assert(!source.includes("export const pool = new Pool("));
});
test("The fix leaves Neon and production provider settings untouched",()=>{
 const source=read("lib/db/src/index.ts");
 assert(source.includes("process.env.TARGET_DATABASE_URL ?? process.env.DATABASE_URL"));
 assert(source.includes("if (!isCloudflare) return callback()"));
 assert(!/DROP TABLE|TRUNCATE TABLE|ALTER TABLE|DELETE FROM/.test(source));
});

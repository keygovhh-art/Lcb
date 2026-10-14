import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import pg from "pg";

/**
 * Safe additive migration runner for the independently deployable My Askanus/MAX.
 * Not invoked on production automatically. No table/data deletions.
 * Staging: MAX_MIGRATION_MODE=staging DATABASE_URL=... node ...
 * Production: requires a separate, explicit confirmed release with backup.
 */
const mode=process.env.MAX_MIGRATION_MODE;
if(mode!=="staging" && mode!=="production")
  throw Error("MAX_MIGRATION_MODE must be staging or production.");
if(mode==="production" && process.env.MAX_PRODUCTION_MIGRATION_APPROVED!=="yes-reviewed-and-backed-up")
  throw Error("Refusing production migration without backup + explicit release approval.");
if(!process.env.DATABASE_URL)throw Error("DATABASE_URL missing");
const root=resolve(fileURLToPath(new URL("../../../",import.meta.url)));
const migrations=[
 "20261014_gavhah_max_communication.sql",
 "20261014_max_donor360_pledges.sql",
 "20261014_max_receipt_reversals.sql",
 "20261014_max_followup_times.sql",
 "20261014_max_progress_idempotency.sql",
 "20261014_max_release_indexes.sql",
];
const client=new pg.Client({connectionString:process.env.DATABASE_URL});
await client.connect();
try{
 await client.query("BEGIN");
 // Prevent concurrent instances of this migration runner from racing.
 await client.query("SELECT pg_advisory_xact_lock(13878142)");
 for(const name of migrations){
  const raw=readFileSync(resolve(root,"lib/db/migrations",name),"utf8");
  // Bundled migrations intentionally have only straightforward statements; no
  // semicolons inside PL/pgSQL blocks. Ignore comment-only lines.
  const statements=raw.split("\n").filter(x=>!x.trim().startsWith("--"))
    .join("\n").split(";").map(x=>x.trim()).filter(Boolean);
  for(const query of statements) await client.query(query);
  console.log("Applied or verified: "+name+" ("+statements.length+" steps)");
 }
 const {rows}=await client.query(`
 SELECT table_name FROM information_schema.tables
 WHERE table_schema='public' AND table_name IN
 ('communication_contacts','fundraising_call_reports','max_pledges','max_receipts',
 'max_receipt_refunds','max_followup_contacts','max_progress_events')
 ORDER BY table_name`);
 if(rows.length!==7)throw Error("Expected seven MAX finance/contact tables; found "+rows.length);
 const {rows:cols}=await client.query(`
 SELECT column_name FROM information_schema.columns
 WHERE table_schema='public' AND table_name='max_receipts'
 AND column_name='refunded_amount'`);
 if(cols.length!==1)throw Error("Receipt refund column is missing");
 await client.query("COMMIT");
 console.log("MAX additive schema verified successfully ("+mode+"); 7 tables.");
}catch(e){
 await client.query("ROLLBACK");
 console.error("Migration rolled back:",e);
 process.exitCode=1;
}finally{await client.end();}

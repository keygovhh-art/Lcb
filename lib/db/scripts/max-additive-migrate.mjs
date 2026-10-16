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
// A stale/copied DATABASE_URL must not quietly migrate the wrong Neon branch.
// Local, disposable PostgreSQL in CI is exempt from the explicit host check.
const targetHost=new URL(process.env.DATABASE_URL).hostname;
const isLocalDatabase=["localhost","127.0.0.1","::1"].includes(targetHost);
if(!isLocalDatabase && process.env.MAX_EXPECTED_DB_HOST!==targetHost)
  throw Error("Remote MAX migration denied: set MAX_EXPECTED_DB_HOST to the "+
    "exact, independently verified target database hostname.");

const root=resolve(fileURLToPath(new URL("../../../",import.meta.url)));
const migrations=[
 "20261014_gavhah_max_communication.sql",
 "20261014_max_donor360_pledges.sql",
 "20261014_max_receipt_reversals.sql",
 "20261014_max_followup_times.sql",
 "20261014_max_recurring_followups.sql",
 "20261014_max_renewed_calling_permission.sql",
 "20261014_max_reminder_snoozes.sql",
 "20261014_max_contact_attributes.sql",
 "20261014_max_permanent_history.sql",
 "20261014_max_completion_timestamps.sql",
 "20261014_max_progress_idempotency.sql",
 "20261014_max_release_indexes.sql",
 "20261015_max_call_dual_amounts.sql",
];
const client=new pg.Client({connectionString:process.env.DATABASE_URL});
await client.connect();
try{
 await client.query("BEGIN");
 // Prevent concurrent instances of this migration runner from racing.
 await client.query("SELECT pg_advisory_xact_lock(13878142)");
 // Fail closed on unexpected source-data changes: new MAX migrations must only
 // ADD tables/columns/indexes and NEVER remove old projects, tasks or history.
 const protectedTables=["askanus_cases","askanus_tasks","askanus_notes",
   "case_followups","case_activity_log"];
 const counts=async()=>{
   const records={};
   for(const table of protectedTables){
     const {rows}=await client.query('SELECT count(*)::bigint AS total FROM "'+table+'"');
     records[table]=rows[0].total;
   }
   return records;
 };
 const before=await counts();
 for(const name of migrations){
  const raw=readFileSync(resolve(root,"lib/db/migrations",name),"utf8");
  // Bundled migrations intentionally have only straightforward statements; no
  // semicolons inside PL/pgSQL blocks. Ignore comment-only lines.
  const statements=raw.split("\n").filter(x=>!x.trim().startsWith("--"))
    .join("\n").split(";").map(x=>x.trim()).filter(Boolean);
  for(const query of statements) await client.query(query);
  console.log("Applied or verified: "+name+" ("+statements.length+" steps)");
 }
 // All standalone MAX tables must be present, not only the first seven.
 const requiredTables=[
   "communication_contacts","fundraising_call_reports","max_pledges",
   "max_receipts","max_receipt_refunds","max_followup_contacts",
   "max_progress_events","max_contact_consents","max_reminder_snoozes",
   "max_history_events",
 ];
 const {rows:tables}=await client.query(`
   SELECT table_name FROM information_schema.tables
   WHERE table_schema='public' AND table_name=ANY($1::text[])
 `,[requiredTables]);
 const foundTables=new Set(tables.map(r=>r.table_name));
 const missingTables=requiredTables.filter(n=>!foundTables.has(n));
 if(missingTables.length)throw Error("MAX tables missing: "+missingTables.join(", "));

 // Explicit column checklist for old My Askanus compatibility, timestamps,
 // recurring follow-ups, reconciliation and durable history.
 const requiredColumns={
   askanus_cases:["closed_at"],
   askanus_tasks:["completed_at"],
   case_followups:["due_time","time_zone","repeat_rule","repeat_anchor_day",
     "generated_from_id","completed_at"],
   communication_contacts:["organization","city","tags","do_not_call"],
   max_receipts:["refunded_amount"],
   max_history_events:["user_id","case_id","entity_type","entity_id","action",
     "title","details","happened_at"],
   max_contact_consents:["action","prior_opt_out_reason"],
 };
 for(const [table,columns] of Object.entries(requiredColumns)){
   const {rows}=await client.query(`
     SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1 AND column_name=ANY($2::text[])
   `,[table,columns]);
   const existing=new Set(rows.map(r=>r.column_name));
   const missing=columns.filter(column=>!existing.has(column));
   if(missing.length)throw Error(table+" columns missing: "+missing.join(", "));
 }
 const after=await counts();
 for(const table of protectedTables){
   if(before[table]!==after[table])
     throw Error("STOP: "+table+" source count changed during additive migration "+
       before[table]+" -> "+after[table]);
 }
 console.log("Verified non-destructive protected baseline:",
   JSON.stringify(Object.fromEntries(
     Object.entries(before).map(([k,v])=>[k,v.toString()])
   )));
 await client.query("COMMIT");
 console.log("MAX additive schema verified successfully ("+mode+"); 10 MAX tables and all protected legacy row counts.");
}catch(e){
 await client.query("ROLLBACK");
 console.error("Migration rolled back:",e);
 process.exitCode=1;
}finally{await client.end();}

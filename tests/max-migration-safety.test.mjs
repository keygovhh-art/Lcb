import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const runner=resolve("lib/db/scripts/max-additive-migrate.mjs");
const fakeUrl="postgresql://fake:fake@unverified-branch.example.invalid/neondb";
function run(extra){
  return spawnSync(process.execPath,[runner],{
    encoding:"utf8",env:{
      PATH:process.env.PATH, ...extra,
      DATABASE_URL:fakeUrl,
    },
  });
}
test("remote Neon branches must match an independently verified host",()=>{
  const r=run({MAX_MIGRATION_MODE:"staging"});
  assert.notEqual(r.status,0);
  assert.match(r.stderr,/MAX_EXPECTED_DB_HOST/);
});
test("release protection: production refuses missing reviewed backup approval",()=>{
  const r=run({MAX_MIGRATION_MODE:"production",MAX_EXPECTED_DB_HOST:"unverified-branch.example.invalid"});
  assert.notEqual(r.status,0);
  assert.match(r.stderr,/backup.*explicit release approval/i);
});
test("release protection: never attempt an unspecified migration mode",()=>{
  const r=run({MAX_EXPECTED_DB_HOST:"unverified-branch.example.invalid"});
  assert.notEqual(r.status,0);
  assert.match(r.stderr,/MAX_MIGRATION_MODE/);
});

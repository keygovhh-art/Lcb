import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=p=>readFileSync(p,'utf8');
const api=file('artifacts/api-server/src/routes/hotline-migration.ts');
const handler=file('artifacts/api-server/src/lib/yemot-api-driven-phone.ts');
const routes=file('artifacts/api-server/src/routes/yemot-whole-platform-ivr.ts');
const router=file('artifacts/api-server/src/routes/index.ts');
const admin=file('artifacts/gavhah/src/components/admin/next-hotline-migration.tsx');
const menu=file('artifacts/gavhah/src/components/admin/yemot-central-management.tsx');
const schema=file('lib/db/migrations/20261026_next_hotline_staging.sql');

test('Staged replacement is separate from existing live global provider and cannot auto-cutover',()=>{
 assert.match(api,/gavhah_hotline_migration/);
 assert.match(api,/productionLineUntouched:true/);
 assert.match(api,/cutoverEnabled:false/);
 assert.match(api,/stage='draft'/);
 assert.match(api,/stage='testing'/);
 assert.doesNotMatch(api,/UPDATE public.gavhah_yemot_global|DELETE FROM public.gavhah_yemot_global|UpdateExtension|UploadFile|DeleteFile|GetTemplates/);
 assert.doesNotMatch(schema,/DROP TABLE|TRUNCATE TABLE|DELETE FROM|UPDATE public.gavhah_yemot_global/);
 assert.match(schema,/REVOKE ALL ON public.gavhah_hotline_migration FROM PUBLIC/);
});
test('Super administrator must be signed in; write operations demand same-origin browser proof',()=>{
 assert.match(api,/router.use\(requireAuth\)/);
 assert.match(api,/user.role!=="super_admin"/);
 assert.match(api,/if\(!origin\)return false/);
 assert.match(api,/u.protocol==="https:"&&u.host===host/);
 assert.match(api,/Same-origin request required/);
});
test('New callback requires independent hashed ephemeral test secret and new provider type',()=>{
 assert.match(handler,/req.path.endsWith\("\/next-ivr"\)/);
 assert.match(handler,/record\?\.stage!=="testing"/);
 assert.match(handler,/record\?\.provider_kind!=="yemot"/);
 assert.match(handler,/createHash\("sha256"\).update\(supplied\)/);
 assert.match(handler,/timingSafeEqual\(Buffer.from\(record.callback_hash,"hex"\),Buffer.from\(suppliedHash,"hex"\)\)/);
 assert.match(api,/randomBytes\(32\).toString\("hex"\)/);
 assert.match(api,/callback_hash=NULL/);
 assert.match(api,/secret:"NEVER_RETURNED"/);
 assert.match(api,/entryKey,/);
});
test('Replacement runs existing Gavhah backend, preserves independent /4444 and old /0',()=>{
 assert.match(routes,/router.all\("\/yemot\/next-ivr"/);
 assert.match(routes,/router.all\("\/yemot\/ivr\/4444"/);
 assert.match(routes,/router.all\("\/yemot\/ivr"/);
 assert.match(router,/router.use\("\/admin\/hotline-migration",hotlineMigrationRouter\)/);
 assert.match(handler,/const directGavhah=fromNext\|\|ready4444/);
 assert.match(handler,/fromNext\?nextHotlineRoot/);
 assert.match(handler,/path===""/);
 assert.match(handler,/go_to_folder=\/0/);
 assert.match(handler,/fromNext\)\{/);
 assert.match(handler,/gavhah_yemot_call_states/);
 assert.match(handler,/gavhah_hotline_migration_probes/);
 assert.match(handler,/ON CONFLICT DO NOTHING RETURNING call_hash/);
});
test('Migration keeps same website accounts and call logic, does not claim recordings transferred',()=>{
 assert.match(api,/whatRemainsOnGavhah/);
 assert.match(api,/ריקארדירונגען/);
 assert.match(api,/stillToCheck/);
 assert.match(schema,/gavhah_hotline_migration_probes/);
 assert.match(menu,/NextHotlineMigration/);
 assert.match(admin,/phone|טלפון|האטליין/u);
 assert.match(admin,/cutoverEnabled|איבערשאלטונג/u);
 assert.match(admin,/candidateNumber/);
 assert.match(admin,/setOneTime\(null\)/);
});

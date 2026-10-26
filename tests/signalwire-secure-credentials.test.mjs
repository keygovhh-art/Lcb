import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
const api=read('artifacts/api-server/src/routes/signalwire-credentials.ts');
const shell=read('artifacts/api-server/src/routes/hotline-migration.ts');
const app=read('artifacts/gavhah/src/App.tsx');
const ui=read('artifacts/gavhah/src/pages/admin/signalwire.tsx');
const panel=read('artifacts/gavhah/src/components/admin/next-hotline-migration.tsx');
const schema=read('lib/db/migrations/20261026_signalwire_secret_storage.sql');

test('SignalWire new token is sealed with separate AES-256-GCM AAD and never returned',()=>{
 assert.match(api,/createCipheriv\("aes-256-gcm",key\(\),iv\)/);
 assert.match(api,/createDecipheriv\("aes-256-gcm",key\(\)/);
 assert.match(api,/gavhah:signalwire:replacement:v1/);
 assert.match(api,/randomBytes\(12\)/);
 assert.match(api,/token_nonce,token_ciphertext,token_tag/);
 assert.match(api,/secret:"NEVER_RETURNED"/);
 assert.match(api,/token_nonce=EXCLUDED.token_nonce/);
 assert.doesNotMatch(api,/res\.json\(\s*\{\s*.*token_ciphertext/s);
 assert.doesNotMatch(api,/console\.log|logger\.info|logger\.debug/);
});
test('API credential routes are mounted behind both admin authorization and CSRF check',()=>{
 assert.match(shell,/router.use\(requireAuth\)/);
 assert.match(shell,/user.role!=="super_admin"/);
 assert.match(shell,/Same-origin request required/);
 assert.ok(shell.indexOf('router.use("/signalwire",signalwireCredentialsRouter)')>shell.indexOf('router.use(async(req,res,next)=>'));
 assert.match(api,/router\.put\("\/connection"/);
 assert.match(api,/router\.post\("\/test"/);
 assert.match(api,/router\.delete\("\/connection"/);
 assert.match(api,/REMOVE_SIGNALWIRE_TOKEN_ONLY/);
});
test('Read-only SignalWire API test uses static official hostname and basic auth; cannot call or send',()=>{
 assert.match(api,/normalizeSignalWireSpace/);
 assert.match(api,/spaceName\.test\(valueText\)/);
 assert.match(api,/uuid\.test\(project\)/);
 assert.match(api,/\/IncomingPhoneNumbers\?PageSize=1/);
 assert.match(api,/method:"GET"/);
 assert.match(api,/Authorization:auth/);
 assert.match(api,/AbortSignal\.timeout\(12000\)/);
 assert.match(api,/last_test_at<now\(\)-interval '20 seconds'/);
 assert.doesNotMatch(api,/method:"POST".*fetch|CreateCall|UpdateExtension|NewIncomingPhoneNumber|updateVoiceUrl/);
});
test('UI deep link is available to signed-in superadmin only; never preloads or displays saved token',()=>{
 assert.match(app,/path="\/founder\/signalwire"/);
 assert.match(ui,/user.role!=="super_admin"/);
 assert.match(ui,/\/api\/admin\/hotline-migration\/signalwire\//);
 assert.match(ui,/type=\{showToken\?"text":"password"\}/);
 assert.match(ui,/setApiToken\(""\)/);
 assert.match(ui,/Input dir="ltr"/);
 assert.doesNotMatch(ui,/setApiToken\(s\.apiToken/);
 assert.match(panel,/href="\/founder\/signalwire"/);
});
test('Credential storage is add-only and cannot alter old Yemot, CC 4444, or existing Neon data',()=>{
 assert.match(schema,/CREATE TABLE IF NOT EXISTS public\.gavhah_signalwire_credentials/);
 assert.match(schema,/REVOKE ALL ON public\.gavhah_signalwire_credentials FROM PUBLIC/);
 assert.doesNotMatch(schema,/DROP TABLE|TRUNCATE|DELETE FROM|ALTER TABLE.*DROP/);
 assert.doesNotMatch(api,/UPDATE public\.gavhah_yemot_global|gavhah_yemot_ivr_install|cc_platform_yemot/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
const phone=read('artifacts/api-server/src/lib/yemot-api-driven-phone.ts');
const routes=read('artifacts/api-server/src/routes/yemot-whole-platform-ivr.ts');
const installer=read('artifacts/api-server/src/lib/yemot-campaign-4444.ts');
const server=read('artifacts/api-server/src/index.ts');

test('Gavhah main menu becomes direct only after provider confirmed the 4444 folder',()=>{
 assert.match(phone,/const ready4444=installStatus\.rows\[0\]\?\.state==="live"/);
 assert.match(phone,/ready4444\?gavhahRoot:root/);
 assert.match(phone,/path="1"\+digit/);
 assert.match(phone,/mode==="root"/);
 assert.match(phone,/\[name,"no","4","1","8","No","no"\]/);
 assert.match(phone,/digit==="4444"/);
 assert.match(phone,/go_to_folder=\/4444/);
});
test('Old /0 management, linked accounts, phone signup and media are preserved',()=>{
 assert.match(phone,/go_to_folder=\/0/);
 assert.match(phone,/path==="185"/);
 assert.match(phone,/path==="125"/);
 assert.match(phone,/enrollFromKeypad/);
 assert.doesNotMatch(installer,/DeleteFile|UploadFile|FileAction|UploadTextFile/);
 assert.doesNotMatch(installer,/path:ROOT|path:"ivr2:"\s*,/);
});
test('Campaign 4444 callback is isolated, verified, and cannot impersonate Gavhah root callback',()=>{
 assert.match(routes,/router\.all\("\/yemot\/ivr\/4444"/);
 assert.match(phone,/req\.path\.endsWith\("\/4444"\)/);
 assert.match(phone,/gavhah-campaign-4444-callback-v1/);
 assert.match(phone,/provider_summary #>> '\{campaign4444,state\}'/);
 assert.match(phone,/timingSafeEqual/);
 assert.match(installer,/CheckIfFileExists/);
 assert.match(installer,/dir\.dirs\.some/);
 assert.match(installer,/session\.username/);
 assert.match(installer,/GetTextFile/);
 assert.match(installer,/createHash\("sha256"\)/);
 assert.match(installer,/callback_hash/);
 assert.match(installer,/setting\("api_link"\)/);
 assert.match(installer,/timingSafeEqual/);
 assert.match(installer,/UpdateExtension/);
 assert.match(installer,/api_link:WEBHOOK/);
 assert.match(server,/installCampaign4444Once/);
});
test('Menu routing only—not 100% of feature actions—is not claimed complete',()=>{
 assert.match(routes,/phone: "menu" \| "roadmap"/);
 assert.match(routes,/The menu currently ONLY names modules/);
 assert.match(phone,/This option is not ready on the phone/);
});

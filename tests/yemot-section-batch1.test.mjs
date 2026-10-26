import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readPhoneSection,sectionPaths,sectionRequiresLogin,currentPhoneActionId,confirmPhoneAction} from '../artifacts/api-server/src/lib/yemot-section-batch1.ts';

const handler=readFileSync('artifacts/api-server/src/lib/yemot-api-driven-phone.ts','utf8');
const mk=(row,seen=[])=>({
  query:async(sql,params=[])=>{
   seen.push({sql,params});
   return {rows:row===null?[]:[typeof row==='function'?row(sql,params):row],rowCount:row===null?0:1};
  }
});
test('16 actual phone sections have explicit security and require account pairing for personal data', async()=>{
 assert.equal(sectionPaths.size,16);
 assert.equal(sectionRequiresLogin.size,12);
 const requests=[];
 const out=await readPhoneSection(mk({name:'should never be read'},requests),'132',null,0);
 assert.match(out,/private/i);
 assert.equal(requests.length,0,'Private record must not be read before verifying member');
 assert.match(handler,/memberAllowed\(client,\{\.\.\.s,member_id:userId\}\)/);
 assert.match(handler,/readPhoneSection\(client,path,permitted\?userId:null,page\)/);
});
test('private contacts show sanitized name but never speak phone, email, private notes',async()=>{
 const seen=[];
 const out=await readPhoneSection(mk({name:'A & B',city:'Brooklyn',phone:'9998887777',email:'secret@site.com',notes:'hidden'},seen),'132',7,0);
 assert.match(out,/Private contact/);
 assert.doesNotMatch(out,/9998887777|secret@site.com|hidden/);
 assert.ok(seen[0].sql.includes('user_id=$1'));
 assert.deepEqual(seen[0].params,[7,0]);
});
test('phone calling queue filters do-not-call and does not originate calls',async()=>{
 const seen=[];
 const out=await readPhoneSection(mk({name:'Example',do_not_call:false},seen),'141',7,2);
 assert.match(out,/No outgoing telephone call is started/);
 assert.match(seen[0].sql,/do_not_call,false/);
 assert.deepEqual(seen[0].params,[7,2]);
});
test('public charity listing uses only active published campaigns',async()=>{
 const seen=[];
 const out=await readPhoneSection(mk({name:'Campaign',goal_amount:1000,raised_amount:50},seen),'151',null,0);
 assert.match(out,/No phone payments are collected/);
 assert.match(seen[0].sql,/is_active=true/);
 assert.match(seen[0].sql,/publication_state='live'/);
 assert.match(seen[0].sql,/scheduled_at<=now\(\)/);
});
test('minyans require approval, reservations are private, pages capped',async()=>{
 const a=[],b=[];
 await readPhoneSection(mk({synagogue_name:'Public',city:'NY'},a),'171',null,100);
 assert.match(a[0].sql,/status='approved'/);
 assert.deepEqual(a[0].params,[40]);
 await readPhoneSection(mk({name:'Owner',reservation_date:'2026-10-26',reservation_time:'12:00',status:'pending'},b),'172',4,1);
 assert.match(b[0].sql,/user_id=\$1/);
 assert.deepEqual(b[0].params,[4,1]);
});
test('Do Not Call is double-confirmed, owner-scoped, logged, and never auto-dials',async()=>{
 const logs=[];
 const client={
  query:async(sql,params=[])=>{
   logs.push({sql,params});
   if(sql.startsWith('SELECT id FROM public.communication_contacts'))return {rows:[{id:31}],rowCount:1};
   if(sql.startsWith('UPDATE public.communication_contacts'))return {rows:[{id:31,name:'Example'}],rowCount:1};
   return {rows:[],rowCount:1};
  }
 };
 const id=await currentPhoneActionId(client,'132',9,1);
 assert.equal(id,31);
 const msg=await confirmPhoneAction(client,'132',9,id);
 assert.match(msg,/Do Not Call is enabled/);
 assert.match(logs[1].sql,/user_id=\$2/);
 assert.match(logs[1].sql,/do_not_call=true/);
 assert.match(logs[2].sql,/max_history_events/);
 assert.match(handler,/confirmId===id/);
 assert.match(handler,/digit==="5"/);
});
test('Notification read action updates only the authenticated member record',async()=>{
 const queries=[];
 const client=mk({id:8},queries);
 const msg=await confirmPhoneAction(client,'181',11,8);
 assert.match(msg,/marked as read/);
 assert.match(queries[0].sql,/WHERE id=\$1 AND user_id=\$2 AND is_read=false/);
 assert.deepEqual(queries[0].params,[8,11]);
});
test('No private phone route can use a caller number as identity',()=>{
 const source=readFileSync('artifacts/api-server/src/lib/yemot-section-batch1.ts','utf8');
 assert.doesNotMatch(source,/ApiCallerId|ApiPhone|callerId/);
 assert.match(source,/No outgoing telephone call is started/);
 assert.match(source,/These are not verified processor payments/);
});

import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {publicIdSections,readPhonePublicById,readPhoneSection} from "../artifacts/api-server/src/lib/yemot-section-batch1.ts";

const ivr=readFileSync("artifacts/api-server/src/lib/yemot-api-driven-phone.ts","utf8");
const tree=readFileSync("artifacts/api-server/src/routes/yemot-whole-platform-ivr.ts","utf8");

function mock(row,queries=[]){
 return {query:async(sql,args=[])=>{
  queries.push({sql,args});
  return {rows:row===null?[]:[row],rowCount:row===null?0:1};
 }};
}
test("Public by-number paths exist in the same Gavhah tree; no SignalWire administration",()=>{
 assert.deepEqual([...publicIdSections],["155","166","167","173"]);
 for(const label of ["public charity campaign by its website number","selected forum topic","selected group","approved minyan by its website number"]){
  assert.ok(tree.includes(label),label);
 }
 assert.match(ivr,/publicIdSections\.has\(path\)/);
 assert.match(ivr,/readPhonePublicById\(client,path,confirmId,page\)/);
 assert.match(ivr,/mode="article"/);
 assert.match(ivr,/Enter the public website item number/);
});
test("Charity page is strictly published, approved, without payments",async()=>{
 const queries=[];
 const x=await readPhonePublicById(mock({name:"Public campaign",goal_amount:6000,raised_amount:3000,description:"Help families"},queries),"155",13,0);
 assert.match(x.text,/Public charity 13/);
 assert.match(x.text,/No payments are accepted by telephone/);
 assert.match(x.text,/Help families/);
 assert.match(queries[0].sql,/is_active=true/);
 assert.match(queries[0].sql,/publication_state='live'/);
 assert.match(queries[0].sql,/scheduled_at<=now\(\)/);
 assert.deepEqual(queries[0].args,[13]);
});
test("Forum reading reports moderation status without making a new forum post",async()=>{
 const q=[];
 const x=await readPhonePublicById(mock({title:"Official topic",content:"Public discussion",is_locked:true,comment_count:3},q),"166",42,0);
 assert.match(x.text,/Public forum topic 42/);
 assert.match(x.text,/Replies closed/);
 assert.match(x.text,/Public discussion/);
 assert.match(q[0].sql,/WHERE id=\$1/);
});
test("Public groups never permit private or password-only group reads",async()=>{
 const q=[];
 const x=await readPhonePublicById(mock({name:"Public group",description:"Open news",member_count:8},q),"167",12,0);
 assert.match(x.text,/Public community group 12/);
 assert.match(x.text,/Open news/);
 assert.match(q[0].sql,/privacy='public'/);
 assert.doesNotMatch(q[0].sql,/password/);
 const invisible=await readPhonePublicById(mock(null),"167",99,0);
 assert.match(invisible.text,/does not exist or is not approved/);
});
test("Minyan details use approved rows and omit private submitter data",async()=>{
 const q=[];
 const x=await readPhonePublicById(mock({synagogue_name:"Main shul",city:"Monroe",country:"USA",shacharis:"7 AM",mincha:"1 PM",maariv:"9 PM",notes:"Open every day"},q),"173",5,0);
 assert.match(x.text,/Approved minyan 5/);
 assert.match(x.text,/7 AM/);
 assert.match(x.text,/Open every day/);
 assert.match(q[0].sql,/status='approved'/);
 assert.doesNotMatch(q[0].sql,/submitted_by_user_id|address/);
});
test("Numeric input rejects invalid IDs before any query",async()=>{
 for(const n of [0,-1,100000000,Number.NaN]){
  const log=[];
  const x=await readPhonePublicById(mock({name:"Secret"},log),"167",n,0);
  assert.match(x.text,/Invalid public item number/);
  assert.equal(log.length,0);
 }
});
test("Long English posts are chunked; Yiddish text waits for approved audio",async()=>{
 const text="This is readable plain public content with numbered sections. ".repeat(22);
 const ctx=mock({title:"Long article",content:text,is_locked:false,comment_count:0});
 const first=await readPhonePublicById(ctx,"166",1,0);
 const second=await readPhonePublicById(ctx,"166",1,1);
 assert.ok(first.hasMore);
 assert.match(first.text,/Press one for the next part/);
 assert.match(second.text,/Continuation for item 1/);
 assert.ok(first.text.length<430,first.text.length);
 const another=await readPhonePublicById(mock({name:"קהילה",description:"פריוואטקייט",member_count:1}),"167",10,0);
 assert.match(another.text,/approved Yiddish audio/);
 assert.doesNotMatch(another.text,/פריוואטקייט/);
});
test("Browsing offers real item IDs to enter; overrides cannot shadow dynamic data",async()=>{
 const groups=await readPhoneSection(mock({id:23,name:"Open Group"}),"161",null,0);
 const forum=await readPhoneSection(mock({id:57,title:"Community Topic",comment_count:2,is_locked:false}),"162",null,0);
 const minyan=await readPhoneSection(mock({id:21,synagogue_name:"Synagogue",city:"Brooklyn"}),"171",null,0);
 const charity=await readPhoneSection(mock({id:19,name:"Food campaign",raised_amount:100,goal_amount:200}),"151",null,0);
 for(const [out,id] of [[groups,23],[forum,57],[minyan,21],[charity,19]]){
  assert.match(out,new RegExp("number "+id));
 }
 assert.match(ivr,/isNavigationalMenu\(path,tree\)/);
 assert.match(ivr,/return !!current\?\.children/);
});

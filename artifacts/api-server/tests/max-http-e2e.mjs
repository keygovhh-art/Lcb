import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "node:crypto";
import { createRequire } from "node:module";
// Resolve Postgres from the database package so this standalone .mjs test does not
// attempt to import the workspace's uncompiled TypeScript/ESM source tree.
const dbRequire = createRequire(new URL("../../../lib/db/package.json", import.meta.url));
const { Client } = dbRequire("pg");
const pool = new Client({ connectionString: process.env.DATABASE_URL });
await pool.connect();

const base="http://127.0.0.1:"+(process.env.PORT||"35147")+"/api";
const pw="QA-PASSWORD-ONLY-NONPROD-2026";
const hash=(value)=>{
  const salt=randomBytes(16).toString("hex");
  return salt+":"+scryptSync(value,salt,64).toString("hex");
};
const auth={};
async function call(path,{method="GET",cookie,body,origin}={}){
  const r=await fetch(base+path,{
    method,
    headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{}),...(origin?{Origin:origin}:{})},
    ...(body!==undefined?{body:JSON.stringify(body)}:{}),
  });
  const raw=await r.text();
  let data;
  try{data=raw?JSON.parse(raw):{}}catch{data={raw};}
  return {status:r.status,data,cookie:r.headers.get("set-cookie")?.split(";")[0]};
}
const req=(cookie,path,method,body)=>call(path,{cookie,method,body});
function status(actual,expected,why){
  assert.equal(actual.status,expected,why+" status="+actual.status+" data="+JSON.stringify(actual.data).slice(0,400));
}
const id=(label)=>"qa-"+label+"-20261014-reqkey";
try{
  const emails=["qa-max-a@example.invalid","qa-max-b@example.invalid"];
  for(let i=0;i<2;i++){
    await pool.query("INSERT INTO users(name,nickname,email,password_hash,role,status) VALUES($1,$2,$3,$4,'member','active')",
      ["QA Member "+(i+1),"QA Tester",emails[i],hash(pw)]);
  }
  let r=await call("/askanus/contacts");status(r,401,"Unauthenticated contacts");
  const logins=[];
  for(const email of emails){
    const x=await call("/auth/login",{method:"POST",body:{identifier:email,password:pw}});
    status(x,200,"Login "+email);
    assert.ok(x.cookie?.includes("connect.sid"),"Session cookie is missing");
    logins.push(x.cookie);
  }
  const [a,b]=logins;
  // CSRF: session cookies from a forged cross-origin page cannot mutate MAX.
  r=await call("/askanus/contacts",{method:"POST",cookie:a,origin:"https://untrusted.example.invalid",body:{name:"Cross-origin bad"}});
  status(r,403,"Cross-origin mutation blocked");
  r=await call("/askanus/contacts",{method:"POST",cookie:a,origin:"http://127.0.0.1:35147",body:{name:"Same origin test contact"}});
  status(r,201,"Same-origin mutation allowed");

  r=await req(a,"/askanus/cases","POST",{title:"QA Fundraising Project",goalAmount:5000});
  status(r,201,"Create own case");
  const projectId=r.data.id; assert.ok(projectId>0);
  r=await req(a,"/askanus/contacts","POST",{name:"QA Donor",phone:"8455550100"});
  status(r,201,"Create own contact");
  const donorId=r.data.id;
  // Preview-first CSV import: owner scope, de-dup, do-not-call, full CSV export.
  const csv='name,phone,email,notes,do_not_call\r\n'
    +'"QA, Imported Contact","845-555-0166","qa-import@example.invalid","Warm referral",true\r\n'
    +'"Already Exists","8455550100","",duplicate,false\r\n';
  r=await req(a,"/askanus/contacts/import-preview","POST",{csv});
  status(r,200,"CSV preview");
  assert.equal(r.data.total,2);assert.equal(r.data.ready,1);assert.equal(r.data.duplicates,1);
  r=await req(a,"/askanus/contacts/import","POST",{csv});
  status(r,400,"CSV import requires explicit confirm");
  r=await req(a,"/askanus/contacts/import","POST",{csv,confirm:true});
  status(r,201,"Confirmed private CSV import");
  assert.equal(r.data.imported,1);assert.equal(r.data.skipped,1);
  r=await req(a,"/askanus/contacts/import","POST",{csv,confirm:true});
  status(r,201,"CSV retry does not insert another contact");
  assert.equal(r.data.imported,0);
  r=await req(a,"/askanus/contacts?q=Imported","GET");
  status(r,200,"Imported contact searchable");
  assert.equal(r.data.length,1);assert.equal(r.data[0].doNotCall,true);
  const importedId=r.data[0].id;
  r=await req(b,"/askanus/contacts/"+importedId+"/360","GET");
  status(r,404,"Imported contact inaccessible to other member");
  const csvExportResponse=await fetch(base+"/askanus/contacts/export.csv",{headers:{Cookie:a}});
  assert.equal(csvExportResponse.status,200);
  const exportText=await csvExportResponse.text();
  assert.ok(exportText.includes('"QA, Imported Contact"'));
  assert.ok(exportText.includes('"true"'));
  const unauthorizedCsv=await fetch(base+"/askanus/contacts/export.csv",{headers:{Cookie:b}});
  assert.ok(!(await unauthorizedCsv.text()).includes("QA, Imported Contact"));
  r=await req(a,"/askanus/contacts/import-preview","POST",{csv:'name,phone\r\n"Unclosed,8455550101'});
  status(r,400,"Reject invalid quote CSV");


  r=await req(b,"/askanus/contacts/"+donorId+"/360","GET"); status(r,404,"Private donor blocked");
  r=await req(b,"/askanus/cases/"+projectId+"/call-reports","POST",{
    requestId:id("crossowner"),contactName:"Attempt",outcome:"spoke",moneyKind:"received",amount:20
  }); status(r,404,"Cross-user project blocked");

  const received={requestId:id("twenty"),contactId:donorId,contactName:"QA Donor",
    outcome:"spoke",moneyKind:"received",amount:20,note:"QA entered after call"};
  r=await req(a,"/askanus/cases/"+projectId+"/call-reports","POST",received);
  status(r,201,"Log received $20");
  r=await req(a,"/askanus/cases/"+projectId+"/call-reports","POST",received);
  status(r,200,"Retry $20");
  assert.equal(r.data.duplicate,true);

  const promise={requestId:id("thousand"),contactId:donorId,contactName:"QA Donor",
    outcome:"spoke",moneyKind:"pledged",amount:1000,note:"QA $1000 pledge"};
  r=await req(a,"/askanus/cases/"+projectId+"/call-reports","POST",promise);
  status(r,201,"Log pledge");
  r=await req(a,"/askanus/contacts/"+donorId+"/360","GET");
  status(r,200,"Donor profile");
  assert.equal(r.data.pledges.length,1);
  const pledgeId=r.data.pledges[0].id;
  assert.equal(r.data.pledges[0].remaining,1000);
  for(const amount of [200,300]){
    const body={amount,method:"cash",requestId:id("pay"+amount)};
    r=await req(a,"/askanus/pledges/"+pledgeId+"/settlements","POST",body);
    status(r,201,"Partial payment "+amount);
    r=await req(a,"/askanus/pledges/"+pledgeId+"/settlements","POST",body);
    status(r,200,"Duplicate payment "+amount);
    assert.equal(r.data.duplicate,true);
  }
  r=await req(a,"/askanus/contacts/"+donorId+"/360","GET");
  const donor=r.data;
  assert.equal(donor.pledges[0].remaining,500,"Pledge remaining $500");
  assert.equal(donor.receipts.length,3,"$20 + two settlements, no double entries");
  // Source-grounded helper answers require owner authorization and list real IDs.
  r=await req(b,"/askanus/max/assistant?intent=last_call&contactId="+donorId,"GET");
  status(r,404,"Other account cannot ask about donor history");
  r=await req(a,"/askanus/max/assistant?intent=last_call&contactId="+donorId,"GET");
  status(r,200,"Owner gets last manually recorded call");
  assert.equal(r.data.found,true);
  assert.equal(r.data.sources[0].table,"fundraising_call_reports");
  r=await req(a,"/askanus/max/assistant?intent=donor_money&contactId="+donorId,"GET");
  status(r,200,"Donor cash and promise answer");
  assert.equal(r.data.amounts.reportedNetReceived,520);
  assert.equal(r.data.amounts.outstandingPledges,500);
  assert.ok(r.data.sources.some(x=>x.table==="max_receipts"));
  r=await req(a,"/askanus/max/assistant?intent=my_projects","GET");
  status(r,200,"Source-grounded personal projects");
  assert.ok(r.data.sources.some(x=>x.id===projectId));
  r=await req(a,"/askanus/max/assistant?intent=unsupported","GET");
  status(r,400,"No invented answers for unknown intent");
  const twoHundred=donor.receipts.find(x=>x.pledgeId===pledgeId && x.amount===200);
  assert.ok(twoHundred);

  const reverse={amount:100,reason:"QA synthetic partial reversal",requestId:id("refund100")};
  r=await req(a,"/askanus/receipts/"+twoHundred.id+"/refunds","POST",reverse);
  status(r,201,"Refund accounting reversal");
  r=await req(a,"/askanus/receipts/"+twoHundred.id+"/refunds","POST",reverse);
  status(r,200,"Retry refund");
  assert.equal(r.data.duplicate,true);
  r=await req(a,"/askanus/receipts/"+twoHundred.id+"/refunds","POST",{
    amount:150,reason:"Attempt excess",requestId:id("refund-excess")
  });
  status(r,409,"No over-refund");
  r=await req(b,"/askanus/receipts/"+twoHundred.id+"/refunds","POST",{
    amount:5,reason:"Unauthorized",requestId:id("refund-cross")
  });
  status(r,404,"Cannot refund another member's receipt");

  const finance={action:"funds_received",amount:20,requestId:id("myprogress20"),note:"My Askanus extra $20"};
  r=await req(a,"/askanus/cases/"+projectId+"/progress","POST",finance);
  status(r,200,"My Askanus money entry");
  r=await req(a,"/askanus/cases/"+projectId+"/progress","POST",finance);
  status(r,200,"Retry My Askanus money");
  r=await req(a,"/askanus/cases/"+projectId+"/progress","POST",{...finance,amount:25});
  status(r,409,"Reject reused progress key with changed amount");
  r=await req(a,"/askanus/cases/"+projectId,"PATCH",{fundsReceived:9999});
  status(r,409,"Reject direct finance counter overwrite");

  r=await req(a,"/askanus/contacts/"+donorId+"/followups","POST",{
    caseId:projectId,note:"QA return call",dueDate:"2026-11-01",dueTime:"19:30",timeZone:"America/New_York",
  });
  status(r,201,"Link follow-up into My Askanus");
  const followId=r.data.id;
  r=await req(a,"/askanus/followups/"+followId,"PATCH",{note:"QA changed from either section",dueDate:"2026-11-02",dueTime:"20:30",timeZone:"America/New_York"});
  status(r,200,"Edit shared follow-up");
  r=await req(a,"/askanus/followups/"+followId,"PATCH",{dueTime:"29:30",timeZone:"America/New_York"});
  status(r,400,"Reject invalid follow-up clock time");
  r=await req(a,"/askanus/followups/"+followId+"/toggle","PATCH");
  status(r,200,"Complete shared follow-up");
  assert.equal(r.data.completed,true);

  r=await req(a,"/askanus/contacts/"+donorId,"PATCH",{doNotCall:true,optOutReason:"QA opt-out"});
  status(r,200,"Set do-not-call");
  r=await req(a,"/askanus/contacts/"+donorId,"PATCH",{doNotCall:false});
  status(r,409,"Cannot casually remove opt-out");
  r=await req(b,"/askanus/contacts/"+donorId,"PATCH",{name:"Attack"});
  status(r,404,"Cannot edit another user contact");

  r=await req(a,"/askanus/cases","GET");status(r,200,"Read owned cases");
  const c=r.data.find(x=>x.id===projectId);
  assert.ok(c);
  assert.equal(c.fundsReceived,440,"$20 call + $200 + $300 - $100 refund + $20 own progress");
  assert.equal(c.fundsPromised,600,"$1000 pledge - $500 settled + $100 reversed");
  assert.equal(c.followUpNotes.find(f=>f.id===followId)?.note,"QA changed from either section");
  assert.equal(c.followUpNotes.find(f=>f.id===followId)?.completed,true);
  assert.equal(c.followUpNotes.find(f=>f.id===followId)?.dueTime,"20:30");
  assert.equal(c.followUpNotes.find(f=>f.id===followId)?.timeZone,"America/New_York");
  r=await req(a,"/askanus/cases/"+projectId,"DELETE");
  status(r,409,"Cannot delete an audited financial case");
  r=await req(b,"/askanus/cases","GET");
  status(r,200,"Second account list");
  assert.ok(!r.data.some(x=>x.id===projectId),"Second member can see other's case");
  console.log("PASS MAX HTTP/DB E2E: 2 sessions, 20-dollar credit once, pledge 1000/200/300, reversal 100, follow-up, privacy, opt-out and audited case protection");
}finally{
  await pool.end();
}

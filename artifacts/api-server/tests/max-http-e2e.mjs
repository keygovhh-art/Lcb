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
  r=await req(a,"/askanus/contacts","POST",{name:"QA Donor",phone:"8455550100",organization:"QA Chesed Network",city:"Monroe",tags:"warm, important"});
  status(r,201,"Create own contact");
  const donorId=r.data.id;
  r=await req(a,"/askanus/contacts?q=Chesed","GET");
  status(r,200,"Organization search identifies privately owned donor");
  assert.ok(r.data.some(c=>c.id===donorId));
  r=await req(a,"/askanus/contacts?q=Monroe","GET");
  status(r,200,"City search identifies privately owned donor");
  assert.ok(r.data.some(c=>c.id===donorId));
  r=await req(a,"/askanus/contacts/"+donorId,"PATCH",{
    organization:"QA Chesed Network",city:"Monroe",
    tags:"warm, important, warm",contactRole:"donor"
  });
  status(r,200,"Edit structured donor relationship attributes");
  assert.equal(r.data.tags,"warm, important","Repeated tags normalized");
  r=await req(b,"/askanus/contacts?q=Chesed","GET");
  status(r,200,"Other member own search");
  assert.ok(!r.data.some(c=>c.id===donorId));

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
  assert.ok(exportText.includes('"QA Chesed Network"'),"Organization lost in private CSV export");
  assert.ok(exportText.includes('"Monroe"'),"City lost in private CSV export");
  assert.ok(exportText.includes('"warm, important"'),"Tags lost in private CSV export");
  const unauthorizedCsv=await fetch(base+"/askanus/contacts/export.csv",{headers:{Cookie:b}});
  assert.ok(!(await unauthorizedCsv.text()).includes("QA, Imported Contact"));
  const richCsv='name,phone,email,notes,organization,city,tags,do_not_call\r\n'
    +'"QA Rich Contact","8455550189","","","QA Hatzolah Group","Brooklyn","regular, referral",false\r\n';
  r=await req(a,"/askanus/contacts/import-preview","POST",{csv:richCsv});
  status(r,200,"Rich CRM CSV preview");
  assert.equal(r.data.ready,1);
  r=await req(a,"/askanus/contacts/import","POST",{csv:richCsv,confirm:true});
  status(r,201,"Rich CRM CSV import");
  assert.equal(r.data.imported,1);
  r=await req(a,"/askanus/contacts?q=Brooklyn","GET");
  status(r,200,"Imported city searchable");
  assert.equal(r.data.length,1);
  assert.equal(r.data[0].organization,"QA Hatzolah Group");
  assert.equal(r.data[0].tags,"regular, referral");
  // The export format must round-trip a historical name-only contact.
  const nameOnlyCsv="name,phone,email,notes,do_not_call\r\n"
    +'"QA Name-only Import","","","No telephone yet",false\r\n';
  r=await req(a,"/askanus/contacts/import-preview","POST",{csv:nameOnlyCsv});
  status(r,200,"Name-only CSV preview");
  assert.equal(r.data.ready,1);
  r=await req(a,"/askanus/contacts/import","POST",{csv:nameOnlyCsv,confirm:true});
  status(r,201,"Name-only contact import");
  assert.equal(r.data.imported,1);
  r=await req(a,"/askanus/contacts/import","POST",{csv:nameOnlyCsv,confirm:true});
  status(r,201,"Name-only import duplicate detection");
  assert.equal(r.data.imported,0);
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
  // MAX reporting: isolate owners, never double-count the same receipt,
  // and never present a manually reported payment as verified by a bank.
  r=await req(a,"/askanus/max/reports?days=30","GET");
  status(r,200,"Source-grounded monthly MAX report");
  const projReport=r.data.projects.find(p=>p.caseId===projectId);
  assert.ok(projReport,"Owned project missing from MAX report");
  assert.equal(projReport.period.manuallyReportedNetAsOfNow,440);
  assert.equal(projReport.period.externallyMarkedVerifiedNet,0);
  assert.equal(projReport.period.newlyRecordedPledges,1000);
  assert.equal(projReport.lifetime.outstandingPromises,600);
  assert.equal(projReport.period.callReportCount,2);
  assert.equal(r.data.summary.periodReportedNet,440);
  r=await req(b,"/askanus/max/reports?days=30","GET");
  status(r,200,"Other member can request own report");
  assert.ok(!r.data.projects.some(p=>p.caseId===projectId),"Member B saw member A financial totals");
  assert.equal(r.data.summary.periodReportedNet,0);
  r=await req(a,"/askanus/max/reports?days=180","GET");
  status(r,400,"Reject unsupported reporting time window");
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
  assert.ok(r.data.completedAt,"Finished followup must record actual completion timestamp");
  const completedFollowupAt=r.data.completedAt;
  r=await req(a,"/askanus/followups/"+followId+"/toggle","PATCH",{completed:true});
  status(r,200,"Retry same completion must not duplicate or change time");
  assert.equal(r.data.completedAt,completedFollowupAt);

  // Repeat a contact-linked monthly follow-up across February without drift.
  r=await req(a,"/askanus/contacts/"+donorId+"/followups","POST",{
    caseId:projectId,note:"QA monthly donor callback",dueDate:"2027-01-31",
    dueTime:"19:30",timeZone:"America/New_York",repeatRule:"monthly",
  });
  status(r,201,"Create monthly donor callback");
  const januaryId=r.data.id;
  r=await req(b,"/askanus/followups/"+januaryId+"/toggle","PATCH",{completed:true});
  status(r,404,"Second member cannot complete recurring task");
  r=await req(a,"/askanus/followups/"+januaryId+"/toggle","PATCH",{completed:true});
  status(r,200,"Complete first monthly follow-up");
  r=await req(a,"/askanus/followups/"+januaryId+"/toggle","PATCH",{completed:true});
  status(r,200,"Completion retry is idempotent");
  r=await req(a,"/askanus/contacts/"+donorId+"/360","GET");
  status(r,200,"New monthly donor follow-up appears in 360");
  let generated=r.data.followups.filter(x=>x.generatedFromId===januaryId);
  assert.equal(generated.length,1,"One February follow-up, not two");
  assert.equal(generated[0].dueDate,"2027-02-28");
  assert.equal(generated[0].timeZone,"America/New_York");
  const februaryId=generated[0].id;
  r=await req(a,"/askanus/followups/"+februaryId+"/toggle","PATCH",{completed:true});
  status(r,200,"Complete February occurrence");
  r=await req(a,"/askanus/contacts/"+donorId+"/360","GET");
  const march=r.data.followups.filter(x=>x.generatedFromId===februaryId);
  assert.equal(march.length,1,"One March follow-up");
  assert.equal(march[0].dueDate,"2027-03-31","Monthly anchor stays on the 31st");
  assert.equal(march[0].repeatRule,"monthly");
  r=await req(a,"/askanus/contacts/"+donorId+"/followups","POST",{
    caseId:projectId,note:"QA invalid recurrence",repeatRule:"weekly",
  });
  status(r,400,"Recurring follow-up requires a due date");
  r=await req(a,"/askanus/contacts/"+donorId+"/followups","POST",{
    caseId:projectId,note:"QA impossible day",dueDate:"2027-02-31",repeatRule:"monthly",
  });
  status(r,400,"Reject impossible calendar day in donor follow-ups");

  // MAX Reminder Inbox: on-screen alerts, cross-device snoozes, original dates
  // remain unchanged in both MAX and My Askanus.
  const reminderDate=new Date(Date.now()-2*86400000).toISOString().slice(0,10);
  r=await req(a,"/askanus/contacts/"+donorId+"/followups","POST",{
    caseId:projectId,note:"QA urgent MAX reminder",
    dueDate:reminderDate,dueTime:"09:00",timeZone:"America/New_York",
  });
  status(r,201,"Create due MAX reminder");
  const reminderId=r.data.id;
  r=await req(a,"/askanus/max/reminders?timeZone=America/New_York&limit=50","GET");
  status(r,200,"Read real timezone-aware member reminder inbox");
  assert.equal(r.data.items.find(x=>x.id===reminderId)?.status,"due");
  assert.equal(r.data.items.find(x=>x.id===reminderId)?.donorName,"QA Donor");
  r=await req(b,"/askanus/max/reminders?timeZone=America/New_York","GET");
  status(r,200,"Second account reminder list");
  assert.ok(!r.data.items.some(x=>x.id===reminderId),"Member B saw member A reminder");
  r=await req(a,"/askanus/max/reminders?timeZone=Not_A_Real_Zone","GET");
  status(r,400,"Reject invalid timezone");
  const until=new Date(Date.now()+86400000).toISOString();
  r=await req(b,"/askanus/max/reminders/"+reminderId+"/snooze","POST",{until});
  status(r,404,"Second member cannot snooze first member followup");
  r=await req(a,"/askanus/max/reminders/"+reminderId+"/snooze","POST",{until});
  status(r,200,"Snooze reminder without changing case followup");
  r=await req(a,"/askanus/max/reminders/"+reminderId+"/snooze","POST",{until});
  status(r,200,"Retry with same fixed snooze time");
  r=await req(a,"/askanus/max/reminders?timeZone=America/New_York","GET");
  status(r,200,"Read snoozed reminder");
  assert.equal(r.data.items.find(x=>x.id===reminderId)?.snoozed,true);
  assert.equal(r.data.items.find(x=>x.id===reminderId)?.dueDate,reminderDate);
  r=await req(a,"/askanus/cases","GET");
  status(r,200,"Read original My Askanus reminder after snooze");
  assert.equal(r.data.find(c=>c.id===projectId)?.followUpNotes.find(x=>x.id===reminderId)?.dueDate,reminderDate);
  r=await req(a,"/askanus/max/reminders/"+reminderId+"/snooze","POST",{clear:true});
  status(r,200,"Owner may unsnooze immediately");
  r=await req(a,"/askanus/max/reminders?timeZone=America/New_York","GET");
  assert.equal(r.data.items.find(x=>x.id===reminderId)?.snoozed,false);
  r=await req(a,"/askanus/followups/"+reminderId+"/toggle","PATCH",{completed:true});
  status(r,200,"Complete shared reminder");
  r=await req(a,"/askanus/max/reminders?timeZone=America/New_York","GET");
  assert.ok(!r.data.items.some(x=>x.id===reminderId),"Completed reminder still appeared in open inbox");
  r=await req(a,"/askanus/contacts/"+donorId,"PATCH",{doNotCall:true,optOutReason:"QA opt-out"});
  status(r,200,"Set do-not-call");
  r=await req(a,"/askanus/contacts/"+donorId,"PATCH",{doNotCall:false});
  status(r,409,"Cannot casually remove opt-out");
  // The user owns their CRM: removing an opt-out marker is possible through a
  // deliberate, auditable decision, which is NOT mislabelled donor re-consent.
  const ownerOverride={action:"owner_override",ownerConfirmedOverride:true,
    evidence:"עסקן באשלוס נאך א פערזענליכער איבערבליק",
    requestId:id("owner-override-dnc")};
  r=await req(a,"/askanus/contacts/"+donorId+"/call-permission","POST",
    {...ownerOverride,ownerConfirmedOverride:false});
  status(r,400,"Must deliberately confirm owner override");
  r=await req(b,"/askanus/contacts/"+donorId+"/call-permission","POST",ownerOverride);
  status(r,404,"Other account cannot remove own donor marker");
  r=await req(a,"/askanus/contacts/"+donorId+"/call-permission","POST",ownerOverride);
  status(r,201,"Owner chooses to remove private do-not-call marker");
  assert.equal(r.data.event.action,"owner_override");
  assert.equal(r.data.contact.doNotCall,false);
  assert.ok(r.data.caveat.includes("NOT the contact's consent"));
  r=await req(a,"/askanus/contacts/"+donorId+"/call-permission","POST",ownerOverride);
  status(r,200,"Same owner override request is retry-safe");
  assert.equal(r.data.duplicate,true);
  r=await req(a,"/askanus/contacts/"+donorId+"/consents","GET");
  status(r,200,"Read owner-only permission decisions");
  assert.equal(r.data.length,1);
  assert.equal(r.data[0].action,"owner_override");
  assert.equal(r.data[0].priorOptOutReason,"QA opt-out");
  r=await req(b,"/askanus/contacts/"+donorId+"/consents","GET");
  status(r,404,"No other-account access to permission audit");
  // The donor can opt out again, and directly renewed consent is distinct.
  r=await req(a,"/askanus/contacts/"+donorId,"PATCH",
    {doNotCall:true,optOutReason:"QA donor asked again"});
  status(r,200,"Owner can set marker back immediately");
  const directConsent={action:"reconsent",method:"incoming_call",
    evidence:"Caller explicitly asked to resume contacts",
    userConfirmedDirectConsent:true,consentAt:new Date().toISOString(),
    requestId:id("donor-reconsent")};
  r=await req(a,"/askanus/contacts/"+donorId+"/call-permission","POST",directConsent);
  status(r,201,"Renewed donor permission is separately identified");
  assert.equal(r.data.event.action,"reconsent");
  r=await req(a,"/askanus/contacts/"+donorId+"/consents","GET");
  status(r,200,"Both kinds of permission action remain in history");
  assert.equal(r.data.length,2);
  assert.equal(r.data[0].action,"reconsent");
  assert.equal(r.data[1].action,"owner_override");
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
  // Completed work must remain forever: due follow-ups, fully paid pledges,
  // closed projects, and completed tasks stay searchable in a private history.
  const fullKey=id("paid-pledge-full-history");
  r=await req(a,"/askanus/cases/"+projectId+"/call-reports","POST",{
    requestId:fullKey,contactId:donorId,contactName:"QA Donor",
    outcome:"spoke",moneyKind:"pledged",amount:120,note:"QA pledge later paid in full"
  });
  status(r,201,"Create separate pledge for permanent settled history");
  r=await req(a,"/askanus/contacts/"+donorId+"/360","GET");
  status(r,200,"Read owner pledge history");
  const paidPledge=r.data.pledges.find(p=>p.amount===120);
  assert.ok(paidPledge,"New $120 pledge not saved");
  r=await req(a,"/askanus/pledges/"+paidPledge.id+"/settlements","POST",{
    amount:120,method:"check",requestId:id("paid-pledge-120")
  });
  status(r,201,"Fully settle separate pledge");
  r=await req(a,"/askanus/contacts/"+donorId+"/360","GET");
  assert.equal(r.data.pledges.find(p=>p.id===paidPledge.id)?.status,"paid");
  assert.equal(r.data.pledges.find(p=>p.id===paidPledge.id)?.remaining,0);
  r=await req(a,"/askanus/cases/"+projectId,"PATCH",{status:"closed"});
  status(r,200,"Finish the campaign/project without erasing it");
  assert.ok(r.data.closedAt,"Closing a project must record real closure time");
  r=await req(a,"/askanus/tasks","POST",{title:"QA archived completed task"});
  status(r,201,"Create synthetic personal task");
  const completedTaskId=r.data.id;
  r=await req(a,"/askanus/tasks/"+completedTaskId,"PATCH",{completed:true});
  status(r,200,"Finish a task while retaining it");
  assert.ok(r.data.completedAt,"Completed task lacks timestamp");
  const completedTaskAt=r.data.completedAt;
  r=await req(a,"/askanus/tasks/"+completedTaskId,"PATCH",{completed:true});
  status(r,200,"Retry task completion");
  assert.equal(r.data.completedAt,completedTaskAt,"Retry changed historical done time");

  r=await req(a,"/askanus/max/history?limit=100","GET");
  status(r,200,"Load permanent private full history");
  const hist=r.data.items;
  assert.ok(hist.some(x=>x.kind==="followups"&&x.entityId===followId&&x.action==="completed"),
    "Finished followup was lost from history");
  assert.ok(hist.some(x=>x.kind==="pledges"&&x.entityId===paidPledge.id&&x.action==="paid"),
    "Fully settled pledge was lost from history");
  assert.ok(hist.some(x=>x.kind==="cases"&&x.entityId===projectId&&x.action==="closed"),
    "Closed project was lost from history");
  assert.ok(hist.some(x=>x.kind==="tasks"&&x.entityId===completedTaskId&&x.action==="completed"),
    "Completed task was lost from history");
  assert.ok(hist.some(x=>x.kind==="events"&&x.action==="pledge_fully_paid"),
    "Immutable settled-pledge event was not recorded");
  assert.ok(hist.some(x=>x.kind==="events"&&x.action==="case_completed"),
    "Closed project event missing");
  assert.ok(hist.some(x=>x.kind==="events"&&x.action==="followup_completed"),
    "Followup completion event missing");
  r=await req(b,"/askanus/max/history?limit=100","GET");
  status(r,200,"History must be private by user");
  assert.ok(!r.data.items.some(x=>x.caseId===projectId),
    "Cross-account private history was exposed");
  r=await req(a,"/askanus/max/history?kind=pledges&q=pledged&limit=10","GET");
  status(r,200,"Search historical pledges");
  assert.ok(r.data.items.some(x=>x.entityId===paidPledge.id));
  r=await req(a,"/askanus/max/history?caseId="+projectId+"&kind=followups&limit=50","GET");
  status(r,200,"Filtered finished follow-up history on the same project");
  assert.ok(r.data.items.some(x=>x.entityId===followId&&x.action==="completed"));
  r=await req(a,"/askanus/max/history?kind=garbage","GET");
  status(r,400,"Invalid history filter rejected");
  r=await req(a,"/askanus/cases","GET");
  assert.equal(r.data.find(x=>x.id===projectId)?.status,"closed");
  assert.equal(r.data.find(x=>x.id===projectId)?.followUpNotes.find(x=>x.id===followId)?.completed,true);
  r=await req(a,"/askanus/finance/overview?caseId="+projectId,"GET");
  status(r,200,"Finance history available even after project closure");
  assert.ok(r.data.pledges.some(p=>p.id===paidPledge.id&&p.status==="paid"));
  // A genuinely explicit Delete is the only way a finished nonfinancial
  // source record disappears. Its separate timestamped deletion event survives.
  r=await req(a,"/askanus/cases","POST",{title:"QA Explicit Delete History"});
  status(r,201,"Create independently deletable project");
  const disposableProjectId=r.data.id;
  r=await req(a,"/askanus/cases/"+disposableProjectId+"/progress","POST",{
    action:"followup",note:"QA once completed then explicitly deleted",
    dueDate:"2027-01-21"
  });
  status(r,200,"Add historical followup to disposable case");
  const disposableFollowupId=r.data.followUpNotes[0].id;
  r=await req(a,"/askanus/followups/"+disposableFollowupId+"/toggle","PATCH",{completed:true});
  status(r,200,"Finish disposable task WITHOUT deleting it");
  r=await req(a,"/askanus/max/history?caseId="+disposableProjectId+"&kind=followups","GET");
  status(r,200,"Finished task still exists in the source history");
  assert.ok(r.data.items.some(x=>x.entityId===disposableFollowupId&&x.action==="completed"));
  r=await req(a,"/askanus/followups/"+disposableFollowupId,"DELETE");
  status(r,200,"Explicitly delete follow-up");
  r=await req(a,"/askanus/max/history?caseId="+disposableProjectId+"&kind=events","GET");
  status(r,200,"Audit log preserves explicitly deleted followup");
  assert.ok(r.data.items.some(x=>x.entityId===disposableFollowupId&&x.action==="followup_explicitly_deleted"));
  r=await req(a,"/askanus/cases/"+disposableProjectId,"DELETE");
  status(r,200,"Explicitly delete non-financial case");
  r=await req(a,"/askanus/max/history?caseId="+disposableProjectId+"&kind=events","GET");
  status(r,200,"Audit snapshot survives explicit project deletion");
  assert.ok(r.data.items.some(x=>x.action==="case_explicitly_deleted"&&x.title==="QA Explicit Delete History"));
  assert.ok(r.data.items.some(x=>x.action==="followup_completed"),
    "Completion event must remain even when owner later deletes its parent case");
  r=await req(b,"/askanus/max/history?caseId="+disposableProjectId,"GET");
  status(r,200,"A second account cannot inspect deleted-case snapshots");
  assert.equal(r.data.items.length,0);
  r=await req(a,"/askanus/cases/"+projectId,"DELETE");
  status(r,409,"Cannot delete an audited financial case");
  r=await req(b,"/askanus/cases","GET");
  status(r,200,"Second account list");
  assert.ok(!r.data.some(x=>x.id===projectId),"Second member can see other's case");
  console.log("PASS MAX HTTP/DB E2E: 2 sessions, consent and operator override separately audited, donor CSV, source helper, idempotent donations, refunds, monthly recurring follow-ups, privacy and audit");
}finally{
  await pool.end();
}

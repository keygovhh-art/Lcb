import type { PoolClient } from "pg";
import { createHmac } from "node:crypto";
import { verifyPassword } from "./crypto";

// Private My Askanus: every query is constrained to the verified member.
// All selection numbers are ephemeral menu positions, not global record IDs.
export type MyState = {
  path:string; page:number; focusId:number|null; flash:string;
  memberId:number|null; callHash:string; failures:number;
};
export type MyResult = Partial<MyState> & {feedback?:string; signedInUntil?:Date|null};
const prefix="12";
export const isMyAskanusPath=(p:string)=>p===prefix||p.startsWith(prefix);
export const isMyAskanusNumericEntry=(p:string)=>(
  ["1231","1234","123521","123522","123523","12356","1241","1244","1253","1261","1262","127"].includes(p)
);
const say=(value:unknown,max=170)=>{
 const v=String(value??"").replace(/<[^>]*>/g," ").replace(/https?:\/\/\S+/gi," ");
 return /[\u0590-\u05ff]/u.test(v)?"A Yiddish title is saved in your account. Open the record to read the full text. ":
 v.replace(/[&=,;#]/g," ").replace(/[^\x20-\x7e]/g," ").replace(/\s+/g," ").trim().slice(0,max);
};
const pos=(n:number)=>Math.max(0,Math.min(100000,Math.floor(n||0)));
const myBack=(path:string)=>{
 if(["1235","1245","1264"].includes(path))return path.slice(0,3);
 if(["12355"].includes(path))return "12354";
 if(path.length>3)return path.slice(0,-1);
 return "12";
};
const numbered=(n:number)=>String(n).split("").join(" ");
async function owned(client:PoolClient,table:"askanus_cases"|"askanus_tasks"|"askanus_notes",uid:number,id:number){
 const r=await client.query(`SELECT id FROM public.${table} WHERE user_id=$1 AND id=$2`,[uid,id]);
 return !!r.rowCount;
}
async function rows(client:PoolClient,table:"askanus_cases"|"askanus_tasks"|"askanus_notes"|"max_history_events",uid:number,oldFirst:boolean,page:number,term?:string){
 const order=oldFirst?"ASC":"DESC";
 const where=term ? " AND id=$3" : "";
 const params=term?[uid,pos(page)*7,Number(term)]:[uid,pos(page)*7];
 return (await client.query(`SELECT * FROM public.${table} WHERE user_id=$1${where} ORDER BY ${table==="askanus_cases"?"last_updated":table==="max_history_events"?"happened_at":"created_at"} ${order},id ${order} LIMIT 7 OFFSET $2`,params)).rows;
}
async function current(client:PoolClient,s:MyState){
 if(!s.memberId||!s.focusId)return null;
 const table=s.path.startsWith("123")?"askanus_cases":s.path.startsWith("124")?"askanus_tasks":"askanus_notes";
 return (await client.query(`SELECT * FROM public.${table} WHERE user_id=$1 AND id=$2`,[s.memberId,s.focusId])).rows[0]||null;
}
const financeKey=(s:MyState,kind:string,amount:string)=>createHmac("sha256",process.env.YEMOT_ENCRYPTION_KEY||"gavhah-test-nonproduction")
 .update(["my-askanus",s.callHash,s.memberId,s.focusId,kind,amount,s.flash].join(":")).digest("hex");
async function totals(client:PoolClient,uid:number,onlyToday:boolean){
 if(!onlyToday){
  const r=await client.query(`
    SELECT
    (SELECT COUNT(*)::int FROM public.askanus_cases WHERE user_id=$1 AND status='closed') helped,
    (SELECT COUNT(*)::int FROM public.askanus_cases WHERE user_id=$1 AND status!='closed') open_cases,
    (SELECT COALESCE(SUM(funds_received),0)::text FROM public.askanus_cases WHERE user_id=$1) funds_raised,
    (SELECT COALESCE(SUM(funds_promised),0)::text FROM public.askanus_cases WHERE user_id=$1) pledged,
    (SELECT COALESCE(SUM(goal_amount),0)::text FROM public.askanus_cases WHERE user_id=$1 AND status!='closed') goal,
    (SELECT COALESCE(SUM(GREATEST(0,goal_amount-funds_received-funds_promised)),0)::text FROM public.askanus_cases WHERE user_id=$1 AND status!='closed') outstanding,
    (SELECT COUNT(*)::int FROM public.askanus_tasks WHERE user_id=$1 AND completed=true) tasks_done,
    (SELECT COUNT(*)::int FROM public.askanus_tasks WHERE user_id=$1 AND completed=false) pending_tasks,
    (SELECT COUNT(*)::int FROM public.case_followups f JOIN public.askanus_cases c ON c.id=f.case_id WHERE c.user_id=$1 AND f.completed=false) pending_followups`,[uid]);
  return r.rows[0];
 }
 const r=await client.query(`
  SELECT
  (SELECT COUNT(*)::int FROM public.askanus_cases WHERE user_id=$1 AND closed_at AT TIME ZONE 'America/New_York' >= date_trunc('day',now() AT TIME ZONE 'America/New_York')) helped,
  (SELECT COUNT(*)::int FROM public.askanus_cases WHERE user_id=$1 AND ((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/New_York')::date=(now() AT TIME ZONE 'America/New_York')::date) open_cases,
  (SELECT COALESCE(SUM(amount),0)::text FROM public.max_progress_events WHERE user_id=$1 AND event_kind='funds_received' AND (created_at AT TIME ZONE 'America/New_York')::date=(now() AT TIME ZONE 'America/New_York')::date) funds_raised,
  (SELECT COALESCE(SUM(amount),0)::text FROM public.max_progress_events WHERE user_id=$1 AND event_kind='funds_promised' AND (created_at AT TIME ZONE 'America/New_York')::date=(now() AT TIME ZONE 'America/New_York')::date) pledged,
  (SELECT COALESCE(SUM(goal_amount),0)::text FROM public.askanus_cases WHERE user_id=$1 AND ((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/New_York')::date=(now() AT TIME ZONE 'America/New_York')::date) goal,
  0::text outstanding,
  (SELECT COUNT(*)::int FROM public.askanus_tasks WHERE user_id=$1 AND completed=true AND (completed_at AT TIME ZONE 'America/New_York')::date=(now() AT TIME ZONE 'America/New_York')::date) tasks_done,
  (SELECT COUNT(*)::int FROM public.askanus_tasks WHERE user_id=$1 AND completed=false AND ((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/New_York')::date=(now() AT TIME ZONE 'America/New_York')::date) pending_tasks,
  (SELECT COUNT(*)::int FROM public.case_followups f JOIN public.askanus_cases c ON c.id=f.case_id WHERE c.user_id=$1 AND ((f.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/New_York')::date=(now() AT TIME ZONE 'America/New_York')::date) pending_followups`,[uid]);
 return r.rows[0];
}
function stats(x:any,today:boolean){
 return (today?"What was accomplished today. ":"What was accomplished, all time. ")+
  "People helped "+x.helped+". Opened cases "+x.open_cases+
  ". Funds raised "+x.funds_raised+" dollars. Pledged "+x.pledged+
  " dollars. Total goal "+x.goal+" dollars. "+
  (!today?"Funds outstanding "+x.outstanding+" dollars. ":"")+
  "Tasks completed "+x.tasks_done+". Pending tasks "+x.pending_tasks+
  ". Follow ups "+x.pending_followups+". Press zero to go back.";
}
function formatRecord(r:any,n:number,kind:"case"|"task"|"note"|"history"){
 const title=say(r.title||r.note,110)||"Audio title is not available";
 if(kind==="case")return "Number "+n+". "+title+". Status "+r.status+". Received "+r.funds_received+" dollars. Pledged "+r.funds_promised+" dollars. ";
 if(kind==="task")return "Number "+n+". "+title+". "+(r.completed?"Completed. ":"Pending. ")+"Priority "+r.priority+". ";
 if(kind==="note")return "Number "+n+". "+title+". "+(r.crossed_out?"Crossed out. ":"")+(r.completed?"Completed. ":"");
 return "Number "+n+". "+title+". Action "+say(r.action,50)+". ";
}
const menu="My Askanus. Press 1 for all-time accomplishments. Press 2 for what was accomplished today. Press 3 for cases. Press 4 for tasks. Press 5 for history. Press 6 for private notes. Press 7 to sign in using your Gavhah ID and personal PIN. Press 8 to sign out. ";
export async function myAskanusPrompt(client:PoolClient,s:MyState):Promise<string>{
 if(s.path==="127")return s.flash.startsWith("ma:id:")?"Enter your personal six to twelve digit PIN and press pound. ":"Enter your four digit Gavhah member ID and press pound. ";
 if(s.path==="128")return "To sign out, press 1. Press zero to cancel. ";
 if(!s.memberId)return "Your personal records are private. Press 7 to sign in using your Gavhah member ID and private PIN. ";
 if(s.path==="12")return menu;
 if(s.path==="121"||s.path==="122")return stats(await totals(client,s.memberId,s.path==="122"),s.path==="122");
 if(s.path==="123")return "Cases. Press 1 to open a new case, 2 to hear newest to oldest, 3 oldest to newest, or 4 to search by case number. ";
 if(s.path==="124")return "Tasks. Press 1 to add a task, 2 newest to oldest, 3 oldest to newest, or 4 search by task number. ";
 if(s.path==="125")return "My activity history. Press 1 newest to oldest, 2 oldest to newest, or 3 to search by event number. ";
 if(s.path==="126")return "Private notes. Press 1 for a new note, 2 search by number, or 3 to hear all notes. ";
 if(["1231","1241","1261"].includes(s.path))return s.path==="1231"?"Enter a numeric case reference and press pound. The case will be created in your account and its details can be edited later. ":s.path==="1241"?"Enter a numeric task reference and press pound to add it. ":"Enter a numeric note reference and press pound to add it. ";
 if(["1234","1244","1253","1262"].includes(s.path))return "Enter the record number and press pound. ";
 if(s.path==="1235"){
  const r=await current(client,s);if(!r)return "Case not found. Press zero to return.";
  return "Case "+say(r.title,120)+". Status "+r.status+". Priority "+r.urgency+". Goal "+r.goal_amount+" dollars. Received "+r.funds_received+" dollars. Pledged "+r.funds_promised+" dollars. Description "+say(r.description,160)+". Press 1 for full statistics. Press 2 to change status, 3 for finances, 4 for case history, 5 for follow ups, 6 to add a follow up. ";
 }
 if(s.path==="12351"){const r=await current(client,s);return r?"Case "+say(r.title,80)+". Received "+r.funds_received+" dollars, pledged "+r.funds_promised+" dollars, goal "+r.goal_amount+" dollars. Opened "+new Date(r.created_at).toDateString()+". ":"Case unavailable. ";}
 if(s.path==="12352")return "Case status. Press 1 open, 2 in progress, 3 completed. "+(s.flash.startsWith("ma:status:")?"Press 5 to confirm the change. ":"");
 if(s.path==="12353")return "Finance. Press 1 to set a new goal, 2 to record money received, 3 to record a pledge. ";
 if(["123531","123532","123533"].includes(s.path))return s.flash.startsWith("ma:finance:")?"Amount received. Press 5 to confirm and write the audited financial record. Press zero to cancel. ":"Enter an amount in whole dollars and press pound. ";
 if(s.path==="12354")return await caseActivityPrompt(client,s);
 if(s.path==="12355")return await followupPrompt(client,s);
 if(s.path==="12356")return "Enter a numeric follow up reference and press pound to add it to this case. Edit the description and due date from the account when needed. ";
 if(s.path==="12357")return "Selected follow up. Press 1 to mark completed or reopen. Press 2 to delete the follow up, then confirm with 5. ";
 if(s.path==="1245"){
  const r=await current(client,s);if(!r)return "Task unavailable.";
  return "Task "+say(r.title,150)+". "+(r.completed?"Completed. ":"Pending. ")+"Priority "+r.priority+". Deadline "+say(r.deadline)+". Notes "+say(r.notes)+". Press 1 to mark completed or reopen. Press 2 to change priority. Press 3 to delete with confirmation.";
 }
 if(s.path==="12451")return "Task priority. Press 1 low, 2 medium, or 3 high.";
 if(s.path==="1264"){
  const r=await current(client,s);if(!r)return "Note unavailable.";
  return "Note "+say(r.title,120)+". "+say(r.content,185)+". "+(r.crossed_out?"This note is crossed out. ":"")+(r.completed?"This note is completed. ":"")+
   "Press 1 to cross out or restore, 2 to mark completed or reopen, 3 to delete permanently. Deletion requires confirmation with 5. ";
 }
 if(s.path.startsWith("1232")||s.path.startsWith("1233")||s.path==="1242"||s.path==="1243"||s.path==="1263"||s.path==="1251"||s.path==="1252"){
  if(s.path.startsWith("125"))return historyPrompt(client,s);
  const kind=s.path.startsWith("123")?"case":s.path.startsWith("124")?"task":"note";
  const table=kind==="case"?"askanus_cases":kind==="task"?"askanus_tasks":"askanus_notes";
  const list=await rows(client,table,s.memberId,s.path==="1233"||s.path==="1243",s.page);
  return list.length?list.map((r,i)=>formatRecord(r,i+1,kind)).join(" ")+
   " Press the listed number 1 to 7 to open it. Press 8 next page, 9 previous page, zero to return. ":
   "No more records. Press 9 for previous page or zero to return. ";
 }
 return "Press zero to return to My Askanus. ";
}
async function caseActivityPrompt(c:PoolClient,s:MyState){
 const list=(await c.query("SELECT date,type,note,amount FROM public.case_activity_log WHERE case_id=$1 AND EXISTS(SELECT 1 FROM public.askanus_cases WHERE id=$1 AND user_id=$2) ORDER BY created_at DESC,id DESC LIMIT 1 OFFSET $3",[s.focusId,s.memberId,pos(s.page)])).rows;
 if(!list.length)return "No additional case history. Press 9 to return to the previous entry.";
 const a=list[0];return "Case action "+(s.page+1)+". "+a.date+". "+say(a.type)+" "+say(a.note,185)+(a.amount?" Amount "+a.amount+" dollars. ":"")+
  " Press 8 for the next entry, 9 previous, or zero to return. ";
}
async function followupPrompt(c:PoolClient,s:MyState){
 const list=(await c.query("SELECT id,note,due_date,completed FROM public.case_followups WHERE case_id=$1 AND EXISTS(SELECT 1 FROM public.askanus_cases WHERE id=$1 AND user_id=$2) ORDER BY created_at DESC,id DESC LIMIT 7 OFFSET $3",[s.focusId,s.memberId,pos(s.page)*7])).rows;
 if(!list.length)return "No follow ups on this page. Press zero to return.";
 return list.map((x,i)=>"Number "+(i+1)+". "+say(x.note)+" Due "+say(x.due_date)+". "+(x.completed?"Completed. ":"Pending. ")).join(" ")+
 " Press 1 to 7 to select. Press 8 next page, 9 previous. ";
}
async function historyPrompt(c:PoolClient,s:MyState){
 const isOld=s.path==="1252";const a=await rows(c,"max_history_events",s.memberId!,isOld,s.page);
 return a.length?a.map((x,i)=>formatRecord(x,i+1,"history")).join(" ")+
  " Press 8 next page, 9 previous page. Use history search by record number from the previous menu. ":
  "No more history. Press 9 for previous. ";
}
async function login(c:PoolClient,s:MyState,digit:string):Promise<MyResult>{
 const pinStage=s.flash.startsWith("ma:id:");
 if(!pinStage){
  if(!/^\d{4}$/.test(digit))return {feedback:"Enter the four digit member ID. "};
  const r=await c.query("SELECT user_id FROM public.gavhah_phone_member_logins WHERE member_no=$1 OR short_member_no=$1 LIMIT 1",[digit]);
  if(!r.rowCount)return {feedback:"Member ID not found. Register your Gavhah account through the official hotline signup. "};
  return {flash:"ma:id:"+r.rows[0].user_id,feedback:"Now enter your private PIN. "};
 }
 if(!/^\d{6,12}$/.test(digit))return {feedback:"The personal PIN must be six to twelve digits. "};
 const uid=Number(s.flash.slice(6));if(!Number.isSafeInteger(uid)||uid<1)return {flash:"",feedback:"Start with your member ID. "};
 const key=process.env.YEMOT_ENCRYPTION_KEY||"";
 if(key.length<36)return {flash:"",feedback:"Private PIN verification is not enabled yet. "};
 const digest=createHmac("sha256",key).update("ma-pin-login:"+uid).digest("hex");
 await c.query("INSERT INTO public.gavhah_pin_login_attempts(digest,failures) VALUES($1,0) ON CONFLICT(digest) DO NOTHING",[digest]);
 const limit=await c.query("SELECT failures,locked_until FROM public.gavhah_pin_login_attempts WHERE digest=$1 FOR UPDATE",[digest]);
 if(limit.rows[0]?.locked_until&&new Date(limit.rows[0].locked_until)>new Date())return {flash:"",feedback:"Too many PIN attempts. This account is temporarily locked. "};
 const user=(await c.query("SELECT id,password_hash FROM public.users WHERE id=$1 AND status NOT IN ('banned','suspended')",[uid])).rows[0];
 const valid=!!user?.password_hash&&await verifyPassword(digit,user.password_hash);
 if(!valid){
  await c.query("UPDATE public.gavhah_pin_login_attempts SET failures=failures+1,locked_until=CASE WHEN failures+1>=5 THEN now()+interval '30 minutes' ELSE NULL END,updated_at=now() WHERE digest=$1",[digest]);
  return {flash:"",failures:s.failures+1,feedback:"Incorrect PIN. Start again with your member ID. "};
 }
 await c.query("UPDATE public.gavhah_pin_login_attempts SET failures=0,locked_until=NULL,updated_at=now() WHERE digest=$1",[digest]);
 return {path:"12",page:0,focusId:null,flash:"",memberId:uid,failures:0,signedInUntil:new Date(Date.now()+30*60000),feedback:"Welcome to your private My Askanus. "};
}
export async function myAskanusDigit(c:PoolClient,s:MyState,digit:string):Promise<MyResult>{
 if(digit==="0")return {path:myBack(s.path),page:0,flash:"",focusId:s.path.startsWith("1235")||s.path==="12357"?s.focusId:null};
 if(s.path==="127")return login(c,s,digit);
 if(s.path==="128"){
  return digit==="1"?{path:"12",memberId:null,signedInUntil:null,flash:"",focusId:null,feedback:"Signed out."}:{path:"12"};
 }
 if(!s.memberId)return {path:"127",flash:"",feedback:"Sign in before opening your private information."};
 const uid=s.memberId;
 if(s.path==="12"&&/^[1-8]$/.test(digit))return {path:"12"+digit,page:0,focusId:null,flash:""};
 if(["121","122"].includes(s.path))return {path:"12"};
 if(s.path==="123"&&/^[1-4]$/.test(digit))return {path:"123"+digit,page:0,focusId:null,flash:""};
 if(s.path==="124"&&/^[1-4]$/.test(digit))return {path:"124"+digit,page:0,focusId:null,flash:""};
 if(s.path==="125"&&/^[1-3]$/.test(digit))return {path:"125"+digit,page:0,focusId:null,flash:""};
 if(s.path==="126"&&/^[1-3]$/.test(digit))return {path:"126"+digit,page:0,focusId:null,flash:""};
 if(s.path==="1231"&&/^\d{1,8}$/.test(digit)){
  const title="Phone case "+digit;
  const a=await c.query("INSERT INTO public.askanus_cases(user_id,title,description,category) VALUES($1,$2,$3,'General') RETURNING id",[uid,title,"Created on Gavhah keypad. Please add full details in My Askanus."]);
  await c.query("INSERT INTO public.case_activity_log(case_id,date,type,note) VALUES($1,(now() AT TIME ZONE 'America/New_York')::date::text,'status_change','Case opened by phone')",[a.rows[0].id]);
  return {path:"1235",focusId:a.rows[0].id,page:0,feedback:"Case opened and synced to your account. "};
 }
 if(s.path==="1241"&&/^\d{1,8}$/.test(digit)){
  const a=await c.query("INSERT INTO public.askanus_tasks(user_id,title) VALUES($1,$2) RETURNING id",[uid,"Phone task "+digit]);
  return {path:"1245",focusId:a.rows[0].id,page:0,feedback:"Task created. "};
 }
 if(s.path==="1261"&&/^\d{1,8}$/.test(digit)){
  const a=await c.query("INSERT INTO public.askanus_notes(user_id,title,content) VALUES($1,$2,$3) RETURNING id",[uid,"Phone note "+digit,"Created from the hotline. Edit note text in your account."]);
  return {path:"1264",focusId:a.rows[0].id,page:0,feedback:"Private note saved. "};
 }
 if(["1234","1244","1262"].includes(s.path)&&/^\d{1,8}$/.test(digit)){
  const table=s.path==="1234"?"askanus_cases":s.path==="1244"?"askanus_tasks":"askanus_notes";
  const valid=await owned(c,table,uid,Number(digit));
  return valid?{path:table==="askanus_cases"?"1235":table==="askanus_tasks"?"1245":"1264",focusId:Number(digit),page:0}:
   {feedback:"That record was not found in your private account. "};
 }
 if(s.path==="1253"&&/^\d{1,8}$/.test(digit)){
  const a=(await c.query("SELECT title,action,details,happened_at FROM public.max_history_events WHERE id=$1 AND user_id=$2",[Number(digit),uid])).rows[0];
  return {feedback:a?"Event "+say(a.title)+". "+say(a.action)+". "+say(a.details,155)+". ":"No matching event. "};
 }
 const lists=["1232","1233","1242","1243","1263"];
 if(lists.includes(s.path)){
  if(digit==="8")return {page:s.page+1};
  if(digit==="9")return {page:Math.max(0,s.page-1)};
  if(/^[1-7]$/.test(digit)){
   const table=s.path.startsWith("123")?"askanus_cases":s.path.startsWith("124")?"askanus_tasks":"askanus_notes";
   const list=await rows(c,table,uid,["1233","1243"].includes(s.path),s.page);
   const selected=list[Number(digit)-1];if(!selected)return {feedback:"No item at that number. "};
   return {path:table==="askanus_cases"?"1235":table==="askanus_tasks"?"1245":"1264",focusId:selected.id,page:0};
  }
 }
 if(["1251","1252"].includes(s.path)){
  if(digit==="8")return {page:s.page+1};
  if(digit==="9")return {page:Math.max(0,s.page-1)};
 }
 if(s.path==="1235"){
  if(!await owned(c,"askanus_cases",uid,s.focusId||0))return {path:"123",focusId:null};
  if(digit==="1")return {path:"12351"};
  if(digit==="2")return {path:"12352"};
  if(digit==="3")return {path:"12353"};
  if(digit==="4")return {path:"12354",page:0};
  if(digit==="5")return {path:"12355",page:0};
  if(digit==="6")return {path:"12356"};
 }
 if(s.path==="12352"){
  const vals:Record<string,string>={"1":"open","2":"in_progress","3":"closed"};
  if(vals[digit])return {flash:"ma:status:"+vals[digit],feedback:"Press 5 to confirm. "};
  if(digit==="5"&&s.flash.startsWith("ma:status:")){
   const status=s.flash.slice(10);
   if(!["open","in_progress","closed"].includes(status))return {flash:"",feedback:"Invalid status."};
   const a=await c.query("UPDATE public.askanus_cases SET status=$1::askanus_status,closed_at=CASE WHEN $1='closed' THEN COALESCE(closed_at,now()) ELSE NULL END,last_updated=now() WHERE id=$2 AND user_id=$3 RETURNING id",[status,s.focusId,uid]);
   if(!a.rowCount)return {path:"123",flash:""};
   await c.query("INSERT INTO public.case_activity_log(case_id,date,type,note) VALUES($1,(now() AT TIME ZONE 'America/New_York')::date::text,'status_change',$2)",[s.focusId,"Status changed by phone to "+status]);
   return {path:"1235",flash:"",feedback:"Case status updated. "};
  }
 }
 if(s.path==="12353"&&["1","2","3"].includes(digit))return {path:"12353"+digit,flash:""};
 if(["123531","123532","123533"].includes(s.path)){
  if(digit==="5"&&s.flash.startsWith("ma:finance:")){
   const [, ,kind,amount]=s.flash.split(":");
   const n=Number(amount),rid=financeKey(s,kind,amount);
   if(!Number.isSafeInteger(n)||n<0||n>10000000)return {flash:"",feedback:"Invalid amount. "};
   const result=await c.query("SELECT id FROM public.askanus_cases WHERE id=$1 AND user_id=$2 FOR UPDATE",[s.focusId,uid]);
   if(!result.rowCount)return {path:"123",flash:""};
   if(kind==="goal"){
    await c.query("UPDATE public.askanus_cases SET goal_amount=$1,last_updated=now() WHERE id=$2 AND user_id=$3",[n,s.focusId,uid]);
    await c.query("INSERT INTO public.case_activity_log(case_id,date,type,note) VALUES($1,(now() AT TIME ZONE 'America/New_York')::date::text,'update',$2)",[s.focusId,"Goal updated by phone to "+n]);
   }else{
    if(n<=0)return {flash:"",feedback:"Amount must be positive. "};
    const evKind=kind==="received"?"funds_received":"funds_promised";
    const event=await c.query("INSERT INTO public.max_progress_events(user_id,case_id,event_kind,amount,request_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id",[uid,s.focusId,evKind,n,rid]);
    if(event.rowCount){
     await c.query(`UPDATE public.askanus_cases SET ${kind==="received"?"funds_received":"funds_promised"}=${kind==="received"?"funds_received":"funds_promised"}+$1,last_updated=now() WHERE id=$2 AND user_id=$3`,[n,s.focusId,uid]);
     await c.query("INSERT INTO public.case_activity_log(case_id,date,type,note,amount) VALUES($1,(now() AT TIME ZONE 'America/New_York')::date::text,$2,$3,$4)",[s.focusId,evKind,"Phone recorded "+kind,n]);
     if(kind==="received")await c.query("INSERT INTO public.max_receipts(user_id,case_id,amount,method,verification,request_id,reference) VALUES($1,$2,$3,'other','manually_reported',$4,'Phone recorded')",[uid,s.focusId,n,"my-progress:"+rid]);
     else await c.query("INSERT INTO public.max_pledges(user_id,case_id,amount,note) VALUES($1,$2,$3,'Phone recorded pledge')",[uid,s.focusId,n]);
    }
   }
   return {path:"1235",flash:"",feedback:"Financial record saved. "};
  }
  if(/^\d{1,8}$/.test(digit)){
   const kind=s.path==="123531"?"goal":s.path==="123532"?"received":"promised";
   return {flash:"ma:finance:"+kind+":"+Number(digit),feedback:"Amount "+Number(digit)+" dollars. Press 5 to confirm. "};
  }
 }
 if(s.path==="12354"){
  if(digit==="8")return {page:s.page+1};if(digit==="9")return {page:Math.max(0,s.page-1)};
 }
 if(s.path==="12355"){
  if(digit==="8")return {page:s.page+1};if(digit==="9")return {page:Math.max(0,s.page-1)};
  if(/^[1-7]$/.test(digit)){
   const list=(await c.query("SELECT id FROM public.case_followups WHERE case_id=$1 AND EXISTS(SELECT 1 FROM public.askanus_cases WHERE id=$1 AND user_id=$2) ORDER BY created_at DESC,id DESC LIMIT 7 OFFSET $3",[s.focusId,uid,s.page*7])).rows;
   const id=list[Number(digit)-1]?.id;return id?{path:"12357",flash:"ma:followup:"+id,feedback:"Follow up selected. "}:{feedback:"No follow up there. "};
  }
 }
 if(s.path==="12356"&&/^\d{1,8}$/.test(digit)){
  if(!await owned(c,"askanus_cases",uid,s.focusId||0))return {path:"123"};
  const r=await c.query("INSERT INTO public.case_followups(case_id,date,note) VALUES($1,(now() AT TIME ZONE 'America/New_York')::date::text,$2) RETURNING id",[s.focusId,"Phone follow up "+digit]);
  await c.query("INSERT INTO public.max_history_events(user_id,case_id,entity_type,entity_id,action,title,details) VALUES($1,$2,'followup',$3,'followup_created',$4,'{}')",[uid,s.focusId,r.rows[0].id,"Phone follow up "+digit]);
  return {path:"1235",flash:"",feedback:"Follow up saved. "};
 }
 if(s.path==="12357"){
  const id=Number(s.flash.split(":")[2]);if(!Number.isSafeInteger(id)||!id)return {path:"12355",flash:""};
  const item=(await c.query("SELECT f.* FROM public.case_followups f JOIN public.askanus_cases x ON x.id=f.case_id WHERE f.id=$1 AND x.id=$2 AND x.user_id=$3 FOR UPDATE",[id,s.focusId,uid])).rows[0];
  if(!item)return {path:"12355",flash:""};
  if(digit==="1"){
   const done=!item.completed;
   await c.query("UPDATE public.case_followups SET completed=$1,completed_at=CASE WHEN $1 THEN now() ELSE NULL END WHERE id=$2",[done,id]);
   await c.query("INSERT INTO public.max_history_events(user_id,case_id,entity_type,entity_id,action,title,details) VALUES($1,$2,'followup',$3,$4,$5,'{}')",[uid,s.focusId,id,done?"followup_completed":"followup_reopened",item.note]);
   return {path:"12355",flash:"",feedback:"Follow up updated. "};
  }
  if(digit==="2")return {flash:"ma:followup-delete:"+id,feedback:"Press 5 to permanently delete this follow up. "};
  if(digit==="5"&&s.flash.startsWith("ma:followup-delete:")){
   await c.query("DELETE FROM public.case_followups WHERE id=$1 AND case_id=$2",[id,s.focusId]);
   await c.query("INSERT INTO public.max_history_events(user_id,case_id,entity_type,entity_id,action,title,details) VALUES($1,$2,'followup',$3,'followup_explicitly_deleted',$4,'{}')",[uid,s.focusId,id,item.note]);
   return {path:"12355",flash:"",feedback:"Follow up deleted. "};
  }
 }
 if(s.path==="1245"){
  const r=await current(c,s);if(!r)return {path:"124"};
  if(digit==="1"){
   await c.query("UPDATE public.askanus_tasks SET completed=$1,completed_at=CASE WHEN $1 THEN now() ELSE NULL END WHERE id=$2 AND user_id=$3",[!r.completed,s.focusId,uid]);
   await c.query("INSERT INTO public.max_history_events(user_id,entity_type,entity_id,action,title,details) VALUES($1,'task',$2,$3,$4,'{}')",[uid,s.focusId,r.completed?"task_reopened":"task_completed",r.title]);
   return {feedback:"Task updated. "};
  }
  if(digit==="2")return {path:"12451"};
  if(digit==="3")return {flash:"ma:task-delete:"+s.focusId,feedback:"Press 5 to permanently delete this task. "};
  if(digit==="5"&&s.flash==="ma:task-delete:"+s.focusId){
   await c.query("DELETE FROM public.askanus_tasks WHERE id=$1 AND user_id=$2",[s.focusId,uid]);
   await c.query("INSERT INTO public.max_history_events(user_id,entity_type,entity_id,action,title,details) VALUES($1,'task',$2,'task_explicitly_deleted',$3,'{}')",[uid,s.focusId,r.title]);
   return {path:"124",focusId:null,flash:"",feedback:"Task deleted. "};
  }
 }
 if(s.path==="12451"){
  const values:Record<string,string>={"1":"low","2":"medium","3":"high"};
  if(values[digit]){
   await c.query("UPDATE public.askanus_tasks SET priority=$1::task_priority WHERE id=$2 AND user_id=$3",[values[digit],s.focusId,uid]);
   return {path:"1245",feedback:"Priority updated. "};
  }
 }
 if(s.path==="1264"){
  const r=await current(c,s);if(!r)return {path:"126"};
  if(digit==="1"||digit==="2"){
   const key=digit==="1"?"crossed_out":"completed",val=digit==="1"?!r.crossed_out:!r.completed;
   await c.query(`UPDATE public.askanus_notes SET ${key}=$1 WHERE id=$2 AND user_id=$3`,[val,s.focusId,uid]);
   await c.query("INSERT INTO public.max_history_events(user_id,entity_type,entity_id,action,title,details) VALUES($1,'note',$2,$3,$4,'{}')",[uid,s.focusId,digit==="1"?"note_crossed_out_changed":"note_completion_changed",r.title]);
   return {feedback:"Note updated in your account. "};
  }
  if(digit==="3")return {flash:"ma:note-delete:"+s.focusId,feedback:"Press 5 to permanently delete this private note. "};
  if(digit==="5"&&s.flash==="ma:note-delete:"+s.focusId){
   await c.query("DELETE FROM public.askanus_notes WHERE id=$1 AND user_id=$2",[s.focusId,uid]);
   await c.query("INSERT INTO public.max_history_events(user_id,entity_type,entity_id,action,title,details) VALUES($1,'note',$2,'note_explicitly_deleted',$3,'{}')",[uid,s.focusId,r.title]);
   return {path:"126",focusId:null,flash:"",feedback:"Note deleted. "};
  }
 }
 return {feedback:"Please choose one of the available numbers. "};
}

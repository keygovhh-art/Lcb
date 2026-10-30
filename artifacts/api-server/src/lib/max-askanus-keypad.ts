/**
 * Additional keypad-only actions for linked My Askanus:
 * tasks priorities/deadlines, case status/goal and money progress,
 * follow-up dates, contact DNC, and audited partial pledge settlement.
 * No caller-ID trust, no external charges/refunds or arbitrary SQL identifiers.
 * All calls are inside caller's locked, verified phone session transaction.
 */
import {createHash} from "node:crypto";
import type {PoolClient} from "pg";

type Row={stage:string;index_no:number;selected_id:number|null;pending_title:string;pending_action:string;call_hash:string};
type Reply={stage:string;prompt:string;mode?:"menu"|"speech"|"id";index?:number;id?:number|null;title?:string;action?:string};
const result=(stage:string,prompt:string,mode:"menu"|"speech"|"id"="menu",
  row?:Row,opts?:Partial<Pick<Reply,"index"|"id"|"title"|"action">>):Reply=>({
   stage,prompt,mode,index:opts?.index??row?.index_no??0,id:opts?.id??row?.selected_id??null,
   title:opts?.title??row?.pending_title??"",action:opts?.action??row?.pending_action??""
  });
const end=(message:string)=>result("main",message+" Press 1 tasks, 2 cases, 3 notes, 4 followups, 5 contacts, 6 pledges, 7 overview, 9 more.");
const idValid=(id:number|null)=>Number.isSafeInteger(id)&&Number(id)>0;
const amountCents=(v:string|undefined)=>{
 if(!v||!/^[1-9]\d{0,8}$/.test(v))return null;
 const cents=Number(v);return cents>0&&Number.isSafeInteger(cents)&&cents<=999999999?cents:null;
};
const dateInput=(v:string|undefined)=>{
 if(!v||!/^20[2-9]\d(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])$/.test(v))return null;
 const s=v.slice(0,4)+"-"+v.slice(4,6)+"-"+v.slice(6);
 const dt=new Date(s);
 return Number.isFinite(dt.getTime())&&dt.toISOString().slice(0,10)===s?s:null;
};
const checkRecord=async(client:PoolClient,table:"askanus_tasks"|"askanus_cases"|"case_followups"|"communication_contacts"|"max_pledges",id:number,userId:number)=>{
 const sql=table==="case_followups"
  ? "SELECT f.id FROM public.case_followups f JOIN public.askanus_cases c ON c.id=f.case_id WHERE f.id=$1 AND c.user_id=$2"
  : "SELECT id FROM public."+table+" WHERE id=$1 AND user_id=$2";
 const q=await client.query(sql,[id,userId]);return !!q.rowCount;
};
async function history(client:PoolClient,userId:number,caseId:number|null,kind:string,id:number,action:string,title:string,details:object){
 await client.query("INSERT INTO public.max_history_events(user_id,case_id,entity_type,entity_id,action,title,details) "+
  "VALUES($1,$2,$3,$4,$5,$6,$7)",[userId,caseId,kind,id,action,title,JSON.stringify({...details,source:"verified_phone_keypad"})]);
}
function moneySummary(cents:number){return (cents/100).toFixed(2)+" dollars";}
export async function myAskanusKeypad(client:PoolClient,row:Row,digit:string|undefined,userId:number):Promise<Reply|null>{
 const stage=row.stage,id=row.selected_id,valid=idValid(id);
 const templates={
  task:["Call a contact back","Make a followup call","Prepare a letter","Visit a donor","Complete paperwork","Reach out for assistance","Schedule a meeting","Review an open case"],
  case:["New assistance request","New Chesed project","Urgent help needed","Fundraising outreach","Visit and assistance","Case requiring followup"]
 };
 const phoneKind=(digit?:string,kind?:"task"|"case")=>{
  const items=kind==="case"?templates.case:templates.task;
  const i=Number(digit)-1;
  return digit&&/^[1-9]$/.test(digit)&&i>=0&&i<items.length?items[i]:null;
 };
 if(stage==="main"&&digit==="8")
  return result("key_new_task","Create a new task without voice recognition. 1 call back, 2 followup call, 3 letter, 4 donor visit, 5 paperwork, 6 assistance outreach, 7 meeting, 8 case review. 9 cancel.","menu",row);
 if(stage==="more"&&digit==="7")
  return result("key_new_case","Create a new case without voice recognition. 1 assistance request, 2 Chesed project, 3 urgent help, 4 fundraising outreach, 5 visit and help, 6 new followup case. 9 cancel.","menu",row);
 if(stage==="key_new_task"||stage==="key_new_case"){
  if(digit==="9")return end("Creation cancelled.");
  const kind=stage==="key_new_task"?"task":"case";
  const title=phoneKind(digit,kind);
  if(!title)return result(stage,"Choose a listed task or case template from 1 to "+(kind==="task"?8:6)+".","menu",row);
  return result("confirm_key_new_"+kind,"Create "+kind+" named "+title+
   " in your website account? Press 1 to SAVE; 2 to cancel. You can edit this title from the website later.",
   "menu",row,{title,action:kind});
 }
 if(stage==="confirm_key_new_task"||stage==="confirm_key_new_case"){
  if(digit!=="1"||!row.pending_title)return end("Creation cancelled. No new record.");
  if(stage==="confirm_key_new_task"){
   const q=await client.query<{id:number}>(
    "INSERT INTO public.askanus_tasks(user_id,title,priority) VALUES($1,$2,'medium') RETURNING id",
    [userId,row.pending_title]);
   await history(client,userId,null,"task",q.rows[0].id,"task_created",row.pending_title,{source:"phone_keypad_template"});
   return end("New task "+q.rows[0].id+" is saved on your website.");
  }
  const q=await client.query<{id:number}>(
   "INSERT INTO public.askanus_cases(user_id,title,urgency,category) "+
   "VALUES($1,$2,'medium','General') RETURNING id",[userId,row.pending_title]);
  await client.query("INSERT INTO public.case_activity_log(case_id,date,type,note) "+
   "VALUES($1,$2,'status_change','Case opened through verified phone keypad')",
   [q.rows[0].id,new Date().toISOString().slice(0,10)]);
  await history(client,userId,q.rows[0].id,"case",q.rows[0].id,"case_created",row.pending_title,{source:"phone_keypad_template"});
  return end("New case "+q.rows[0].id+" is saved on your website.");
 }

 if(stage==="item_tasks"&&valid){
  if(digit==="2")return result("key_task_priority","Set priority for task "+id+". 1 low, 2 medium, 3 high, 9 cancel.","menu",row);
  if(digit==="3")return result("key_task_date","Enter task deadline as 8 digits YYYYMMDD ending with pound. 9 cancel.","id",row);
 }
 if(stage==="item_cases"&&valid){
  if(digit==="2")return result("key_case_status","Case status. Press 1 open, 2 in progress, 3 closed, 9 cancel.","menu",row);
  if(digit==="3")return result("key_case_goal","Enter revised GOAL in cents ending with pound. Example: 12500 is 125 dollars. No money will be collected.","id",row);
  if(digit==="4")return result("key_case_money_kind","To LOG a manually reported amount: 1 pledged, 2 received. This does not collect card payments. 9 cancel.","menu",row);
 }
 if(stage==="item_followups"&&valid){
  if(digit==="2")return result("key_followup_date","Change a nonrecurring followup due date. Enter 8 digits YYYYMMDD then pound, 9 cancel.","id",row);
 }
 if(stage==="item_contacts"&&valid){
  if(digit==="2")return result("key_contact_dnc","Do Not Call protection. 1 enable, 2 disable. Confirm explicitly before updating. 9 cancel.","menu",row);
 }
 if(stage==="item_pledges"&&valid){
  if(digit==="2")return result("key_pledge_settlement","Enter the manually reported payment amount in CENTS (not dollars), then pound. No bank/card charge will occur.","id",row);
 }
 if(!stage.startsWith("key_")&&!stage.startsWith("confirm_key_"))return null;
 if(digit==="9")return end("Cancelled. No change.");
 if(!valid)return end("Selected record is missing. No change.");
 const ownedTable=stage.includes("task")?"askanus_tasks":
  (stage.includes("case")||(["funds_promised","funds_received"].includes(row.pending_action)
    && stage.includes("money")))?"askanus_cases":
  stage.includes("followup")?"case_followups":
  stage.includes("contact")?"communication_contacts":"max_pledges";
 if(!await checkRecord(client,ownedTable,id!,userId))return end("This record is not available in your linked account.");
 if(stage==="key_task_priority"){
  const priorities:{[k:string]:string}={"1":"low","2":"medium","3":"high"};
  if(!digit||!priorities[digit])return result(stage,"Select 1 low, 2 medium or 3 high.","menu",row);
  return result("confirm_key_task_priority","Change task "+id+" priority to "+priorities[digit]+
   "? Press 1 to save. 2 cancel.","menu",row,{action:priorities[digit]});
 }
 if(stage==="key_task_date"||stage==="key_followup_date"){
  const date=dateInput(digit);
  if(!date)return result(stage,"Invalid date. Enter a real 8 digit date YYYYMMDD and pound.","id",row);
  const kind=stage==="key_task_date"?"task":"followup";
  return result("confirm_key_"+kind+"_date","Set "+kind+" "+id+" due date to "+date+
   "? 1 save. 2 cancel.","menu",row,{action:date});
 }
 if(stage==="key_case_status"){
  const statuses:{[k:string]:string}={"1":"open","2":"in_progress","3":"closed"};
  if(!digit||!statuses[digit])return result(stage,"Press 1 open, 2 in progress, 3 closed.","menu",row);
  return result("confirm_key_case_status","Change case "+id+" to "+statuses[digit]+
   "? Press 1 to save or 2 cancel.","menu",row,{action:statuses[digit]});
 }
 if(stage==="key_case_goal"){
  const cents=amountCents(digit);
  if(cents===null)return result(stage,"Enter a positive new goal in cents, up to 9 digits, and pound.","id",row);
  return result("confirm_key_case_goal","Set case "+id+" GOAL to "+moneySummary(cents)+
   " ONLY. No funds will be collected. 1 save, 2 cancel.","menu",row,{action:String(cents)});
 }
 if(stage==="key_case_money_kind"){
  if(digit!=="1"&&digit!=="2")return result(stage,"Press 1 to log a promise, 2 for manually reported money received.","menu",row);
  return result("key_case_money_amount","Enter "+(digit==="1"?"pledged":"manually reported received")+
   " amount in cents followed by pound. You will confirm twice.",
   "id",row,{action:digit==="1"?"funds_promised":"funds_received"});
 }
 if(stage==="key_case_money_amount"||stage==="key_pledge_settlement"){
  const cents=amountCents(digit);
  if(cents===null)return result(stage,"Invalid cents amount. Enter 1 to 9 digits, followed by pound.","id",row);
  const kind=stage==="key_pledge_settlement"?"settlement":row.pending_action;
  return result("confirm_key_money_first","You are about to RECORD "+moneySummary(cents)+
   " as "+kind+" for record "+id+". This is an accounting report, not a charge. Press 1 to continue, 2 to cancel.",
   "menu",row,{title:String(cents),action:kind});
 }
 if(stage==="key_contact_dnc"){
  if(digit!=="1"&&digit!=="2")return result(stage,"Press 1 to enable Do Not Call, or 2 to remove Do Not Call.","menu",row);
  return result("confirm_key_contact_dnc","Contact "+id+": "+(digit==="1"?"enable":"disable")+
   " Do Not Call? Press 1 to save, 2 cancel.","menu",row,{action:digit==="1"?"enable":"disable"});
 }
 if(stage==="confirm_key_money_first"){
  if(digit!=="1")return end("Money entry cancelled.");
  return result("confirm_key_money_final","Final confirmation: record "+moneySummary(Number(row.pending_title))+
   " as "+row.pending_action+" for record "+id+". Press 1 AGAIN to save or 2 cancel.",
   "menu",row);
 }
 if(digit!=="1")return end("Cancelled. No changes saved.");
 const date=new Date().toISOString().slice(0,10);
 if(stage==="confirm_key_task_priority"){
  const q=await client.query<{title:string;priority:string}>(
   "UPDATE public.askanus_tasks SET priority=$3::task_priority WHERE id=$1 AND user_id=$2 RETURNING title,priority",
   [id,userId,row.pending_action]);
  if(q.rows[0])await history(client,userId,null,"task",id!,"task_edited",q.rows[0].title,{priority:q.rows[0].priority});
  return end("Task priority saved to website.");
 }
 if(stage==="confirm_key_task_date"){
  const q=await client.query<{title:string;deadline:string}>(
   "UPDATE public.askanus_tasks SET deadline=$3 WHERE id=$1 AND user_id=$2 RETURNING title,deadline",
   [id,userId,row.pending_action]);
  if(q.rows[0])await history(client,userId,null,"task",id!,"task_edited",q.rows[0].title,{deadline:q.rows[0].deadline});
  return end("Task deadline saved on website.");
 }
 if(stage==="confirm_key_followup_date"){
  const q=await client.query<{case_id:number;note:string;due_date:string}>(
   "UPDATE public.case_followups SET due_date=$3 WHERE id=$1 "+
   "AND case_id IN (SELECT id FROM public.askanus_cases WHERE user_id=$2) "+
   "AND repeat_rule='none' RETURNING case_id,note,due_date",[id,userId,row.pending_action]);
  if(q.rows[0])await history(client,userId,q.rows[0].case_id,"followup",id!,"followup_edited",q.rows[0].note.slice(0,240),{dueDate:q.rows[0].due_date});
  return end(q.rows[0]?"Followup date saved on website.":"Recurring followup needs the website calendar to prevent schedule errors.");
 }
 if(stage==="confirm_key_case_status"){
  if(!["open","in_progress","closed"].includes(row.pending_action))return end("Invalid status.");
  const q=await client.query<{title:string;status:string}>(
   "UPDATE public.askanus_cases SET status=$3::askanus_status,"+
   "closed_at=CASE WHEN $3='closed' THEN coalesce(closed_at,now()) ELSE NULL END,last_updated=now() "+
   "WHERE id=$1 AND user_id=$2 RETURNING title,status",[id,userId,row.pending_action]);
  if(q.rows[0]){
   await history(client,userId,id!,"case",id!,
    q.rows[0].status==="closed"?"case_completed":q.rows[0].status==="open"?"case_reopened":"case_status_changed",
    q.rows[0].title,{status:q.rows[0].status});
   await client.query("INSERT INTO public.case_activity_log(case_id,date,type,note) VALUES($1,$2,'status_change',$3)",[
    id,date,"Verified phone: status "+q.rows[0].status]);
  }
  return end("Case status saved on website.");
 }
 if(stage==="confirm_key_case_goal"){
  const cents=Number(row.pending_action);
  if(!Number.isInteger(cents)||cents<1||cents>999999999)return end("Invalid goal.");
  const q=await client.query<{title:string;goal_amount:string}>(
   "UPDATE public.askanus_cases SET goal_amount=$3,last_updated=now() "+
   "WHERE id=$1 AND user_id=$2 RETURNING title,goal_amount",[id,userId,(cents/100).toFixed(2)]);
  if(q.rows[0]){
   await client.query("INSERT INTO public.case_activity_log(case_id,date,type,note) VALUES($1,$2,'update',$3)",[
    id,date,"Goal updated to "+q.rows[0].goal_amount+" dollars via verified phone"]);
   await history(client,userId,id!,"case",id!,"case_goal_changed",q.rows[0].title,{goalAmount:q.rows[0].goal_amount});
  }
  return end("Case financial GOAL updated. No donation was collected.");
 }
 if(stage==="confirm_key_contact_dnc"){
  if(!["enable","disable"].includes(row.pending_action))return end("Invalid call permission.");
  const q=await client.query<{name:string;do_not_call:boolean}>(
   "UPDATE public.communication_contacts SET do_not_call=$3,updated_at=now() "+
   "WHERE id=$1 AND user_id=$2 RETURNING name,do_not_call",[id,userId,row.pending_action==="enable"]);
  if(q.rows[0])await history(client,userId,null,"contact",id!,"contact_dnc_changed",
   q.rows[0].name,{doNotCall:q.rows[0].do_not_call});
  return end("Contact calling preference saved. Only explicit Do Not Call sets the block.");
 }
 if(stage==="confirm_key_money_final"){
  const cents=Number(row.pending_title),kind=row.pending_action;
  if(!Number.isInteger(cents)||cents<1||cents>999999999||
   !["funds_promised","funds_received","settlement"].includes(kind))return end("Invalid monetary entry.");
  const amt=(cents/100).toFixed(2);
  const requestId="phone-"+createHash("sha256").update(row.call_hash+":"+id+":"+kind+":"+amt).digest("hex").slice(0,38);
  if(kind==="settlement"){
   const p=await client.query<{case_id:number;amount:string;paid_amount:string;status:string}>(
    "SELECT case_id,amount,paid_amount,status FROM public.max_pledges "+
    "WHERE id=$1 AND user_id=$2 FOR UPDATE",[id,userId]);
   const pledge=p.rows[0];
   if(!pledge||pledge.status!=="open"||Number(pledge.amount)-Number(pledge.paid_amount)<Number(amt))
    return end("The remaining pledge balance is not enough. Nothing recorded.");
   const q=await client.query<{id:number}>(
    "INSERT INTO public.max_receipts(user_id,case_id,pledge_id,amount,method,reference,verification,request_id) "+
    "VALUES($1,$2,$3,$4,'other','Verified-phone manual report','manually_reported',$5) "+
    "ON CONFLICT DO NOTHING RETURNING id",[userId,pledge.case_id,id,amt,requestId]);
   if(!q.rows[0])return end("Duplicate reported payment ignored.");
   const newPaid=(Number(pledge.paid_amount)+Number(amt)).toFixed(2);
   await client.query("UPDATE public.max_pledges SET paid_amount=$3,status=$4,updated_at=now() "+
    "WHERE id=$1 AND user_id=$2",[id,userId,newPaid,
     Number(newPaid)>=Number(pledge.amount)?"paid":"open"]);
   await client.query("UPDATE public.askanus_cases SET funds_received=funds_received+$3::numeric,"+
    "funds_promised=greatest(0,funds_promised-$3::numeric),last_updated=now() "+
    "WHERE id=$1 AND user_id=$2",[pledge.case_id,userId,amt]);
   await client.query("INSERT INTO public.case_activity_log(case_id,date,type,note,amount) "+
    "VALUES($1,$2,'funds_received',$3,$4)",[pledge.case_id,date,
     "Phone manually reported "+amt+" toward pledge "+id,amt]);
   await history(client,userId,pledge.case_id,"pledge",id!,"pledge_partially_paid",
    "Pledge "+id,{manualAmount:amt,paidTotal:newPaid,receiptId:q.rows[0].id});
   return end("Manually reported pledge payment saved. No card or bank was charged.");
  }
  const entity=await client.query<{title:string}>(
   "SELECT title FROM public.askanus_cases WHERE id=$1 AND user_id=$2 FOR UPDATE",[id,userId]);
  if(!entity.rows[0])return end("Case is unavailable.");
  const q=await client.query<{id:number}>(
   "INSERT INTO public.max_progress_events(user_id,case_id,event_kind,amount,request_id) "+
   "VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id",[userId,id,kind,amt,requestId]);
  if(!q.rows[0])return end("Duplicate financial entry ignored.");
  if(kind==="funds_promised"){
   await client.query("INSERT INTO public.max_pledges(user_id,case_id,amount,note) "+
    "VALUES($1,$2,$3,$4)",[userId,id,amt,"Phone-entered pledge, manually reported"]);
   await client.query("UPDATE public.askanus_cases SET funds_promised=funds_promised+$3::numeric,"+
    "last_updated=now() WHERE id=$1 AND user_id=$2",[id,userId,amt]);
  }else{
   await client.query("INSERT INTO public.max_receipts(user_id,case_id,amount,method,verification,reference,request_id) "+
    "VALUES($1,$2,$3,'other','manually_reported','Verified phone report',$4)",[userId,id,amt,"my-progress:"+requestId]);
   await client.query("UPDATE public.askanus_cases SET funds_received=funds_received+$3::numeric,"+
    "last_updated=now() WHERE id=$1 AND user_id=$2",[id,userId,amt]);
  }
  await client.query("INSERT INTO public.case_activity_log(case_id,date,type,note,amount) "+
   "VALUES($1,$2,$3,$4,$5)",[id,date,kind,
    "Phone manually reported "+kind+" "+amt,amt]);
  await history(client,userId,id!,"case",id!,kind,entity.rows[0].title,{manualAmount:amt});
  return end("Accounting record saved to the website. No real payment was charged.");
 }
 return end("No action performed.");
}

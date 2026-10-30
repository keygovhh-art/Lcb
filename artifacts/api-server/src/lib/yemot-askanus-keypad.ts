/**
 * The My Askanus keypad is exclusively a YEMOT platform feature.
 * It outputs instructions for the existing Yemot API IVR. This module never
 * uses SignalWire/TwiML, phone number-based identity, or provider credentials.
 *
 * The owning website member must first redeem the existing short-lived 8-digit
 * /my account link through the original extension 125.
 */
import type {PoolClient} from "pg";
import {myAskanusKeypad} from "./max-askanus-keypad";

type StageRow={
 call_hash:string;user_id:number;stage:string;index_no:number;
 selected_id:number|null;pending_title:string;pending_action:string;
};
export type YemotAskanusReply={message:string;digits:1|8|9;exit:boolean};
const main="My Askanus advanced keypad. Press 1 tasks; 2 cases; 3 notes; 4 followups; 5 contacts; 6 pledges; 7 account overview; 8 new task on keypad; 9 more options. Press zero for the previous menu.";
const more="More actions: press 1 enter a case number; 2 enter a case number for new followup; 7 create a case from phone keypad; 9 return to the advanced menu.";
const kindCodes:Record<string,string>={"1":"tasks","2":"cases","3":"notes","4":"followups","5":"contacts","6":"pledges"};
type Kind="tasks"|"cases"|"notes"|"followups"|"contacts"|"pledges";
const views:Record<Kind,{query:string;name:string}>={
 tasks:{query:"SELECT id,title,completed,priority,deadline FROM public.askanus_tasks WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1 OFFSET $2",name:"tasks"},
 cases:{query:"SELECT id,title,status,urgency,goal_amount,funds_received,funds_promised FROM public.askanus_cases WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1 OFFSET $2",name:"cases"},
 notes:{query:"SELECT id,title,content FROM public.askanus_notes WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1 OFFSET $2",name:"notes"},
 followups:{query:"SELECT f.id,f.note AS title,f.due_date,f.completed,f.repeat_rule FROM public.case_followups f JOIN public.askanus_cases c ON c.id=f.case_id WHERE c.user_id=$1 ORDER BY f.created_at DESC,f.id DESC LIMIT 1 OFFSET $2",name:"followups"},
 contacts:{query:"SELECT id,name AS title,do_not_call FROM public.communication_contacts WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1 OFFSET $2",name:"contacts"},
 pledges:{query:"SELECT id,case_id AS title,amount,paid_amount,status FROM public.max_pledges WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1 OFFSET $2",name:"pledges"}
};
function safeText(t:unknown,n=80){
 return String(t??"").replace(/[\u0590-\u05ff]/g,"").replace(/[<&=\x00-\x1f]/g," ").replace(/\s+/g," ").slice(0,n).trim();
}
async function getOne(client:PoolClient,kind:Kind,userId:number,index:number){
 return (await client.query<Record<string,unknown>>(views[kind].query,[userId,index])).rows[0]||null;
}
function summary(kind:Kind,x:Record<string,unknown>,n:number){
 let info="";
 if(kind==="tasks")info=x.completed?"Completed.":"Pending. Priority "+x.priority+".";
 if(kind==="cases")info="Status "+x.status+". Goal "+x.goal_amount+" dollars.";
 if(kind==="notes")info=safeText(x.content,110);
 if(kind==="followups")info="Due "+String(x.due_date||"unscheduled")+". "+(x.completed?"Completed.":"Pending.");
 if(kind==="contacts")info=x.do_not_call?"Do Not Call enabled.":"";
 if(kind==="pledges")info="Pledged "+x.amount+" dollars, paid "+x.paid_amount+" dollars.";
 return kind+" "+(n+1)+", record number "+x.id+". "+(safeText(x.title)||"Yiddish title available on the website")+". "+info;
}
function actions(kind:Kind){
 if(kind==="tasks")return "Press 5 options: 1 complete or reopen; 2 priority; 3 deadline.";
 if(kind==="cases")return "Press 5 options: 1 close or reopen; 2 status; 3 goal; 4 log funds.";
 if(kind==="followups")return "Press 5 options: 1 complete or reopen, 2 due date.";
 if(kind==="contacts")return "Press 5 options: 2 Do Not Call.";
 if(kind==="pledges")return "Press 5 options: 2 manually reported partial payment.";
 return "Press 5 for item details.";
}
function response(message:string,digits:1|8|9=1,exit=false):YemotAskanusReply{
 return {message:message.slice(0,650),digits,exit};
}
function entryDigits(stage:string):1|8|9{
 return ["case_number","followup_case_number","key_task_date","key_followup_date",
 "key_case_goal","key_case_money_amount","key_pledge_settlement","followup_date"].includes(stage)?9:1;
}
async function set(client:PoolClient,hash:string,stage:string,index:number,id:number|null,title="",action=""){
 await client.query("UPDATE public.gavhah_yemot_askanus_keypad_sessions SET stage=$2,index_no=$3,selected_id=$4,pending_title=$5,pending_action=$6,expires_at=now()+interval '30 minutes',updated_at=now() WHERE call_hash=$1",
  [hash,stage,index,id,title,action]);
}
export async function yemotAskanusKeypad(
 client:PoolClient,callHash:string,userId:number|null,digit:string|undefined,entering:boolean
):Promise<YemotAskanusReply>{
 if(!userId){
  await client.query("DELETE FROM public.gavhah_yemot_askanus_keypad_sessions WHERE call_hash=$1",[callHash]);
  return response("Private My Askanus requires a website member link. Return to My Askanus and press 5, then enter the 8 digit code from your website.",1,true);
 }
 if(entering){
  await client.query("INSERT INTO public.gavhah_yemot_askanus_keypad_sessions(call_hash,user_id,stage,expires_at) VALUES($1,$2,'main',now()+interval '30 minutes') ON CONFLICT(call_hash) DO UPDATE SET user_id=EXCLUDED.user_id,stage='main',index_no=0,selected_id=NULL,pending_title='',pending_action='',expires_at=EXCLUDED.expires_at,updated_at=now()",[callHash,userId]);
  return response(main);
 }
 const row=(await client.query<StageRow>("SELECT call_hash,user_id,stage,index_no,selected_id,pending_title,pending_action FROM public.gavhah_yemot_askanus_keypad_sessions WHERE call_hash=$1 AND expires_at>now() FOR UPDATE",[callHash])).rows[0];
 if(!row||row.user_id!==userId)return response("Your phone menu has expired. Return to My Askanus and select the advanced keypad again.",1,true);
 if(!digit)return response(row.stage==="main"?main:"Enter the selection from the previous prompt.",entryDigits(row.stage));
 if(digit==="0"){
  await client.query("DELETE FROM public.gavhah_yemot_askanus_keypad_sessions WHERE call_hash=$1",[callHash]);
  return response("Returning to the My Askanus menu.",1,true);
 }
 const handler=await myAskanusKeypad(client,row,digit,userId);
 if(handler){
  await set(client,callHash,handler.stage,handler.index??0,handler.id??null,handler.title||"",handler.action||"");
  return response(handler.prompt,entryDigits(handler.stage));
 }
 if(row.stage==="main"){
  if(kindCodes[digit]){
   const kind=kindCodes[digit] as Kind,x=await getOne(client,kind,userId,0);
   await set(client,callHash,"list_"+kind,0,null);
   return response(x?summary(kind,x,0)+" Press 1 next, 8 previous, 2 restart, 5 options, 9 menu.":"No items in "+kind+". Press 9 to return.");
  }
  if(digit==="7"){
   const r=await client.query<{tasks:number;cases:number;followups:number;contacts:number}>("SELECT (SELECT count(*)::int FROM public.askanus_tasks WHERE user_id=$1 AND completed=false) AS tasks,(SELECT count(*)::int FROM public.askanus_cases WHERE user_id=$1 AND status<>'closed') AS cases,(SELECT count(*)::int FROM public.case_followups f JOIN public.askanus_cases c ON c.id=f.case_id WHERE c.user_id=$1 AND f.completed=false) AS followups,(SELECT count(*)::int FROM public.communication_contacts WHERE user_id=$1) AS contacts",[userId]);
   const s=r.rows[0];return response("You have "+s.tasks+" pending tasks, "+s.cases+" open cases, "+s.followups+" followups and "+s.contacts+" contacts. "+main);
  }
  if(digit==="9"){await set(client,callHash,"more",0,null);return response(more);}
  return response(main);
 }
 if(row.stage==="more"){
  if(digit==="9"){await set(client,callHash,"main",0,null);return response(main);}
  if(digit==="1"||digit==="2"){
   const stage=digit==="1"?"case_number":"followup_case_number";
   await set(client,callHash,stage,0,null);
   return response("Enter your case record number followed by pound.",9);
  }
  return response(more);
 }
 if(row.stage==="case_number"||row.stage==="followup_case_number"){
  if(!/^[1-9]\d{0,8}$/.test(digit))return response("Enter a valid case record number followed by pound.",9);
  const id=Number(digit);
  const item=(await client.query<{id:number;status:string}>("SELECT id,status FROM public.askanus_cases WHERE id=$1 AND user_id=$2",[id,userId])).rows[0];
  if(!item)return response("This case is not in your website account. Enter a different case number.",9);
  if(row.stage==="case_number"){
   await set(client,callHash,"case_status",0,id);
   return response("Case "+id+". Press 1 open, 2 in progress, 3 closed. Press 9 to cancel.");
  }
  await set(client,callHash,"followup_date",0,id);
  return response("Enter 8 digit followup due date year month day, then pound.",9);
 }
 if(row.stage==="case_status"&&row.selected_id){
  const status=({ "1":"open","2":"in_progress","3":"closed" } as Record<string,string>)[digit];
  if(!status)return response("Press 1 open, 2 in progress, 3 closed.");
  await set(client,callHash,"case_confirm",0,row.selected_id,"",status);
  return response("Change case "+row.selected_id+" to "+status+"? Press 1 to confirm. 2 cancel.");
 }
 if(row.stage==="case_confirm"&&row.selected_id){
  if(digit==="1"&&["open","in_progress","closed"].includes(row.pending_action)){
   const q=await client.query<{title:string}>("UPDATE public.askanus_cases SET status=$3::askanus_status,closed_at=CASE WHEN $3='closed' THEN coalesce(closed_at,now()) ELSE NULL END,last_updated=now() WHERE id=$1 AND user_id=$2 RETURNING title",
    [row.selected_id,userId,row.pending_action]);
   if(q.rows[0]){
    await client.query("INSERT INTO public.case_activity_log(case_id,date,type,note) VALUES($1,$2,'status_change',$3)",[row.selected_id,new Date().toISOString().slice(0,10),"Case status set by verified Yemot keypad to "+row.pending_action]);
    await client.query("INSERT INTO public.max_history_events(user_id,case_id,entity_type,entity_id,action,title,details) VALUES($1,$2,'case',$2,'case_status_changed',$3,$4)",[userId,row.selected_id,q.rows[0].title,JSON.stringify({status:row.pending_action,source:"yemot_keypad"})]);
   }
  }
  await set(client,callHash,"main",0,null);
  return response("Saved if confirmed. "+main);
 }
 if(row.stage==="followup_date"&&row.selected_id){
  if(!/^20\d{6}$/.test(digit))return response("Enter 8 digit date year month day, followed by pound.",9);
  const due=digit.slice(0,4)+"-"+digit.slice(4,6)+"-"+digit.slice(6);
  const dt=new Date(due);
  if(!Number.isFinite(dt.getTime())||dt.toISOString().slice(0,10)!==due)return response("Invalid date. Try year month day.",9);
  await set(client,callHash,"followup_confirm",0,row.selected_id,"",due);
  return response("Create a followup for case "+row.selected_id+" due "+due+"? Press 1 to save, 2 cancel.");
 }
 if(row.stage==="followup_confirm"&&row.selected_id){
  if(digit==="1"){
   const owned=(await client.query("SELECT id FROM public.askanus_cases WHERE id=$1 AND user_id=$2",[row.selected_id,userId])).rowCount;
   if(owned){
    const q=await client.query<{id:number}>("INSERT INTO public.case_followups(case_id,date,note,due_date,repeat_rule) VALUES($1,$2,'Phone requested followup',$3,'none') RETURNING id",
     [row.selected_id,new Date().toISOString().slice(0,10),row.pending_action]);
    await client.query("INSERT INTO public.max_history_events(user_id,case_id,entity_type,entity_id,action,title,details) VALUES($1,$2,'followup',$3,'followup_created','Phone followup',$4)",[userId,row.selected_id,q.rows[0].id,JSON.stringify({dueDate:row.pending_action,source:"yemot_keypad"})]);
   }
  }
  await set(client,callHash,"main",0,null);
  return response("Action complete. "+main);
 }
 if(row.stage.startsWith("list_")){
  const kind=row.stage.slice(5) as Kind;
  if(!views[kind])return response(main);
  if(digit==="9"){await set(client,callHash,"main",0,null);return response(main);}
  let index=row.index_no;
  if(digit==="1")index=Math.min(99,index+1);
  if(digit==="8")index=Math.max(0,index-1);
  if(digit==="2")index=0;
  const item=await getOne(client,kind,userId,index);
  if(digit==="5"&&item){
   await set(client,callHash,"item_"+kind,index,Number(item.id));
   return response(summary(kind,item,index)+" "+actions(kind)+" Press 9 to return.");
  }
  await set(client,callHash,row.stage,index,null);
  return response(item?summary(kind,item,index)+" 1 next, 8 previous, 2 restart, 5 options, 9 menu.":"No more items. Press 8 previous or 9 menu.");
 }
 if(row.stage.startsWith("item_")){
  const kind=row.stage.slice(5) as Kind;
  if(!views[kind])return response(main);
  if(digit==="9"){
   const item=await getOne(client,kind,userId,row.index_no);
   await set(client,callHash,"list_"+kind,row.index_no,null);
   return response(item?summary(kind,item,row.index_no)+" 1 next, 5 options, 9 menu.":main);
  }
  if(digit==="1"&&["tasks","cases","followups"].includes(kind)&&row.selected_id){
   if(kind==="followups"){
    const q=await client.query<{repeat_rule:string}>("SELECT f.repeat_rule FROM public.case_followups f JOIN public.askanus_cases c ON c.id=f.case_id WHERE f.id=$1 AND c.user_id=$2",[row.selected_id,userId]);
    if(q.rows[0]?.repeat_rule!=="none")return response("Recurring followup requires website calendar to avoid duplicate appointments. Press 9 return.");
   }
   await set(client,callHash,"toggle_"+kind,row.index_no,row.selected_id);
   return response("Press 1 a SECOND TIME to confirm "+kind+" record "+row.selected_id+" status toggle. Press 2 cancel.");
  }
  return response("Choose a listed option or press 9 return.");
 }
 if(row.stage.startsWith("toggle_")){
  const kind=row.stage.slice(7);
  if(digit==="1"&&row.selected_id){
   let q:{rows:Record<string,unknown>[]}={rows:[]};
   if(kind==="tasks")q=await client.query("UPDATE public.askanus_tasks SET completed=NOT completed,completed_at=CASE WHEN NOT completed THEN now() ELSE NULL END WHERE id=$1 AND user_id=$2 RETURNING id,title,completed",[row.selected_id,userId]);
   if(kind==="cases")q=await client.query("UPDATE public.askanus_cases SET status=CASE WHEN status='closed' THEN 'open'::askanus_status ELSE 'closed'::askanus_status END,closed_at=CASE WHEN status='closed' THEN NULL ELSE now() END,last_updated=now() WHERE id=$1 AND user_id=$2 RETURNING id,title,status",[row.selected_id,userId]);
   if(kind==="followups")q=await client.query("UPDATE public.case_followups SET completed=NOT completed,completed_at=CASE WHEN NOT completed THEN now() ELSE NULL END WHERE id=$1 AND repeat_rule='none' AND case_id IN (SELECT id FROM public.askanus_cases WHERE user_id=$2) RETURNING id,case_id,note,completed",[row.selected_id,userId]);
   if(q.rows[0]){
    const x=q.rows[0],caseId=kind==="cases"?row.selected_id:kind==="followups"?Number(x.case_id):null;
    await client.query("INSERT INTO public.max_history_events(user_id,case_id,entity_type,entity_id,action,title,details) VALUES($1,$2,$3,$4,$5,$6,$7)",[userId,caseId,kind.slice(0,-1),row.selected_id,kind+"_status_changed",safeText(x.title||x.note,200),JSON.stringify({source:"yemot_keypad",completed:x.completed,status:x.status})]);
   }
  }
  await set(client,callHash,"main",0,null);
  return response("Status saved if confirmed. "+main);
 }
 await set(client,callHash,"main",0,null);
 return response(main);
}

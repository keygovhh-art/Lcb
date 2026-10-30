/**
 * Advanced personal My Askanus phone bridge, linked to the SAME database as /my.
 *
 * Secure entry: ONLY signed SignalWire shared webhook after the caller has
 * redeemed the existing eight-digit website linking code and has reached the
 * My Askanus (path 12) menu. Caller ID alone NEVER authenticates anyone.
 *
 * Incremental, explicitly labeled capabilities; this is not website parity.
 * English speech recognition is optional and unverified for Yiddish: new
 * titles must always be read back and confirmed before database mutation.
 *
 * Never intercepts any legacy 55555 action or alters number routing.
 */
import type {Response} from "express";
import {pool} from "@workspace/db";
import type {PoolClient} from "pg";

type S={
 call_hash:string;user_id:number;stage:string;index_no:number;
 selected_id:number|null;pending_title:string;pending_action:string;
 expires_at:Date;
};
const URL_MAX=1100;
const cleanSpeech=(s:unknown)=>{
 if(typeof s!=="string")return "";
 const t=s.replace(/[\u0000-\u001f\u007f<>]/g," ").replace(/\s+/g," ").trim();
 return t.length>=2&&t.length<=180?t:"";
};
const xml=(x:string)=>x.replace(/&/g,"&amp;").replace(/</g,"&lt;")
 .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
function respond(res:Response,url:string,msg:string,mode:"menu"|"speech"|"id"="menu"){
 const input=mode==="speech"?'input="speech" language="en-US" speechTimeout="auto" timeout="8"':
  mode==="id"?'input="dtmf" numDigits="9" finishOnKey="#" timeout="10"':
  'input="dtmf" numDigits="1" timeout="8"';
 const prompt=xml(msg.slice(0,URL_MAX));
 res.status(200).type("application/xml; charset=utf-8").set("Cache-Control","no-store")
 .send('<?xml version="1.0" encoding="UTF-8"?><Response><Gather action="'+xml(url)+
  '" method="POST" '+input+' actionOnEmptyResult="true"><Say voice="alice">'+prompt+
  '</Say></Gather><Say>No input received. Goodbye.</Say><Hangup/></Response>');
}
function say(res:Response,url:string,msg:string){respond(res,url,msg,"menu");}
async function storage(){
 await pool.query("CREATE TABLE IF NOT EXISTS public.gavhah_my_askanus_ivr_session ("+
  "call_hash text PRIMARY KEY,user_id integer NOT NULL,stage text NOT NULL DEFAULT 'main',"+
  "index_no integer NOT NULL DEFAULT 0,selected_id integer,pending_title text NOT NULL DEFAULT '',"+
  "pending_action text NOT NULL DEFAULT '',expires_at timestamptz NOT NULL,updated_at timestamptz NOT NULL DEFAULT now())");
}
async function linked(client:PoolClient,hash:string){
 const q=await client.query<{member_id:number}>(
  "SELECT s.member_id FROM public.gavhah_yemot_call_states s "+
  "JOIN public.users u ON u.id=s.member_id WHERE s.call_hash=$1 "+
  "AND s.member_id IS NOT NULL AND s.linked_until>now() "+
  "AND u.status NOT IN ('banned','suspended')",[hash]);
 return q.rows[0]?.member_id||null;
}
const listSpec={
 tasks:{table:"askanus_tasks",query:"id,title,completed,priority,deadline",label:"tasks"},
 cases:{table:"askanus_cases",query:"id,title,status,urgency,goal_amount,funds_received,funds_promised",label:"cases"},
 notes:{table:"askanus_notes",query:"id,title,content",label:"notes"},
 followups:{table:"case_followups f JOIN public.askanus_cases c ON c.id=f.case_id",
  query:"f.id,f.note AS title,f.completed,f.due_date,f.repeat_rule",label:"followups"},
 contacts:{table:"communication_contacts",query:"id,name AS title,do_not_call,contact_role",label:"contacts"},
 pledges:{table:"max_pledges",query:"id,case_id AS title,amount,paid_amount,status",label:"pledges"}
} as const;
type Kind=keyof typeof listSpec;
const allowed=new Set(Object.keys(listSpec));
function modeStage(kind:Kind){return "list_"+kind;}
async function listOne(client:PoolClient,kind:Kind,userId:number,n:number){
 const spec=listSpec[kind];
 // Table and field identifiers are hard-coded, not caller-supplied SQL.
 const sql=kind==="followups"
  ? "SELECT "+spec.query+" FROM public."+spec.table+
    " WHERE c.user_id=$1 ORDER BY f.created_at DESC,f.id DESC LIMIT 1 OFFSET $2"
  : "SELECT "+spec.query+" FROM public."+spec.table+
    " WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1 OFFSET $2";
 const rows=await client.query<Record<string,unknown>>(sql,[userId,n]);
 return rows.rows[0]||null;
}
function recordSummary(kind:Kind,x:Record<string,unknown>,n:number){
 const title=String(x.title||"").slice(0,100).replace(/[\u0590-\u05ff]/g,"");
 let more="";
 if(kind==="tasks")more=String(x.completed?"Completed. ":"Pending. ")+" Priority "+x.priority+".";
 if(kind==="cases")more=" Status "+x.status+". Priority "+x.urgency+".";
 if(kind==="notes")more=String(x.content||"").slice(0,95).replace(/[\u0590-\u05ff]/g,"");
 if(kind==="followups")more=" Due "+String(x.due_date||"not set")+". "+(x.completed?"Completed.":"Pending.");
 if(kind==="contacts")more=x.do_not_call?"Do Not Call is enabled.":"";
 if(kind==="pledges")more=" Amount "+Number(x.amount||0)+" dollars. Paid "+Number(x.paid_amount||0)+" dollars.";
 return kind+" item "+(n+1)+", record "+x.id+". "+(title||"Title available on website")+". "+more+" ";
}
const menu="My Askanus advanced phone menu. 1 tasks, 2 cases, 3 notes, 4 followups, 5 contacts, 6 pledges, 7 overview, 8 create task by speech, 9 more actions. Press zero to leave.";
async function overview(client:PoolClient,userId:number){
 const q=await client.query<{cases:number;tasks:number;notes:number;followups:number;contacts:number;pledges:number;calls:number}>(
  "SELECT (SELECT count(*)::int FROM public.askanus_cases WHERE user_id=$1 AND status<>'closed') AS cases,"+
  "(SELECT count(*)::int FROM public.askanus_tasks WHERE user_id=$1 AND completed=false) AS tasks,"+
  "(SELECT count(*)::int FROM public.askanus_notes WHERE user_id=$1) AS notes,"+
  "(SELECT count(*)::int FROM public.case_followups f JOIN public.askanus_cases c ON c.id=f.case_id "+
    "WHERE c.user_id=$1 AND f.completed=false) AS followups,"+
  "(SELECT count(*)::int FROM public.communication_contacts WHERE user_id=$1) AS contacts,"+
  "(SELECT count(*)::int FROM public.max_pledges WHERE user_id=$1 AND status='open') AS pledges,"+
  "(SELECT count(*)::int FROM public.fundraising_call_reports WHERE user_id=$1) AS calls",[userId]);
 const x=q.rows[0];
 return "Your current website account has "+x.cases+" open cases, "+x.tasks+" pending tasks, "+
  x.notes+" notes, "+x.followups+" pending followups, "+x.contacts+" contacts, "+
  x.pledges+" open pledges and "+x.calls+" call reports. ";
}
async function setStage(client:PoolClient,hash:string,stage:string,n=0,id:number|null=null,title="",action=""){
 await client.query("UPDATE public.gavhah_my_askanus_ivr_session "+
  "SET stage=$2,index_no=$3,selected_id=$4,pending_title=$5,pending_action=$6,"+
  "updated_at=now() WHERE call_hash=$1",[hash,stage,n,id,title,action]);
}
const listKeys:Record<string,Kind>={"1":"tasks","2":"cases","3":"notes",
 "4":"followups","5":"contacts","6":"pledges"};
const moreMenu="More actions. Press 1 to create a new case by English speech, 2 to create a note, "+
 "3 to manage a case by its website record number, "+
 "4 to make a nonrecurring followup on a case, 5 to read call report count, "+
 "6 to return. For all financial corrections and refunds use the authenticated website.";
export async function advancedAskanusPhone(input:{
 callHash:string;digit?:string;speech?:string;actionUrl:string;
 atAskanusMenu:boolean;res:Response;
}):Promise<boolean>{
 const {callHash,digit,speech,actionUrl,atAskanusMenu,res}=input;
 const entering=digit==="7"&&atAskanusMenu;
 if(!entering){
  try{
   const found=await pool.query(
    "SELECT 1 FROM public.gavhah_my_askanus_ivr_session WHERE call_hash=$1 AND expires_at>now()",
    [callHash]);if(!found.rowCount)return false;
  }catch(e){if((e as {code?:string}).code==="42P01")return false;throw e;}
 }
 await storage();
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const userId=await linked(client,callHash);
  if(!userId){
   await client.query("DELETE FROM public.gavhah_my_askanus_ivr_session WHERE call_hash=$1",[callHash]);
   await client.query("COMMIT");
   if(entering){
    say(res,actionUrl,"Please link your website My Askanus account first with the eight digit code in the regular phone menu, option 5. No private data was opened.");
    return true;
   }
   return false;
  }
  if(entering){
   await client.query("INSERT INTO public.gavhah_my_askanus_ivr_session"+
    "(call_hash,user_id,stage,expires_at) VALUES($1,$2,'main',now()+interval '30 minutes') "+
    "ON CONFLICT(call_hash) DO UPDATE SET user_id=EXCLUDED.user_id,stage='main',"+
    "index_no=0,selected_id=NULL,pending_title='',pending_action='',expires_at=EXCLUDED.expires_at,updated_at=now()",
    [callHash,userId]);
   await client.query("COMMIT");say(res,actionUrl,menu);return true;
  }
  const row=(await client.query<S>(
   "SELECT * FROM public.gavhah_my_askanus_ivr_session WHERE call_hash=$1 AND expires_at>now() FOR UPDATE",
   [callHash])).rows[0];
  if(!row||row.user_id!==userId){
   await client.query("COMMIT");return false;
  }
  const answer=async(stage:string,prompt:string,mode:"menu"|"speech"|"id"="menu",
    offset=0,id:number|null=null,title="",action="")=>{
   await setStage(client,callHash,stage,offset,id,title,action);
   await client.query("COMMIT");respond(res,actionUrl,prompt,mode);
  };
  if(digit==="0"){
   await client.query("DELETE FROM public.gavhah_my_askanus_ivr_session WHERE call_hash=$1",[callHash]);
   await client.query("COMMIT");
   say(res,actionUrl,"Exited advanced My Askanus. Your website information was not deleted. Press zero to hang up.");
   return true;
  }
  if(row.stage==="main"){
   if(digit&&listKeys[digit]){
    const kind=listKeys[digit],x=await listOne(client,kind,userId,0);
    await answer(modeStage(kind),x?recordSummary(kind,x,0)+
     " Press 1 next, 8 previous, 2 restart, 5 item options, 9 menu.":kind+" list is empty. Press 9 menu.", "menu",0);
    return true;
   }
   if(digit==="7"){await answer("main",(await overview(client,userId))+menu);return true;}
   if(digit==="8"){
    await answer("capture_task","Speak the task title clearly in English. The phone will read it back and require confirmation before saving it.", "speech");
    return true;
   }
   if(digit==="9"){await answer("more",moreMenu);return true;}
   await answer("main",menu);return true;
  }
  if(row.stage==="more"){
   if(digit==="1"){await answer("capture_case","Speak the new case title in English. It will be repeated before saving.","speech");return true;}
   if(digit==="2"){await answer("capture_note","Speak a short note in English. It will appear in your website notes only after confirmation.","speech");return true;}
   if(digit==="3"){await answer("case_id","Enter your case record number from the website or cases list, then pound.","id");return true;}
   if(digit==="4"){await answer("followup_case_id","Enter the case number for a new nonrecurring followup, then pound.","id");return true;}
   if(digit==="5"){
    const q=await client.query<{n:number}>("SELECT count(*)::int AS n FROM public.fundraising_call_reports WHERE user_id=$1",[userId]);
    await answer("more",q.rows[0].n+" saved call reports. These are the same records as your website. "+moreMenu);return true;
   }
   await answer("main",menu);return true;
  }

  if(row.stage==="case_id"||row.stage==="followup_case_id"){
   const id=Number(digit);
   if(!digit||!/^[1-9][0-9]{0,8}$/.test(digit)||!Number.isSafeInteger(id)){
    await answer(row.stage,"Please enter an existing case number, followed by pound.","id");return true;
   }
   const found=await client.query<{id:number;title:string;status:string}>(
    "SELECT id,title,status FROM public.askanus_cases WHERE id=$1 AND user_id=$2",[id,userId]);
   if(!found.rows[0]){
    await answer(row.stage,"This case does not belong to your linked website account. Enter another case number.","id");return true;
   }
   const item=found.rows[0];
   if(row.stage==="followup_case_id"){
    await answer("capture_followup","Speak a short followup note in English for case "+
     item.id+". The phone will read it back before saving.","speech",0,id);
    return true;
   }
   await answer("case_options","Case "+id+". "+item.status+
    ". Press 1 open, 2 in progress, 3 closed, 4 add a followup, 9 main menu.",
    "menu",0,id);
   return true;
  }
  if(row.stage==="case_options"){
   if(digit==="9"){await answer("main",menu);return true;}
   if(digit==="4"){
    await answer("capture_followup","Speak a followup note in English. You will set the due date next.","speech",0,row.selected_id);
    return true;
   }
   const choices:Record<string,string>={"1":"open","2":"in_progress","3":"closed"};
   if(digit&&choices[digit]){
    await answer("confirm_case_status","Confirm changing case "+row.selected_id+" to "+
     choices[digit].replace("_"," ")+". Press 1 again to confirm. Press 2 to cancel.",
     "menu",0,row.selected_id,"",choices[digit]);
    return true;
   }
   await answer("main",menu);return true;
  }
  if(row.stage==="confirm_case_status"){
   if(digit==="1"&&row.selected_id&&["open","in_progress","closed"].includes(row.pending_action)){
    const updated=await client.query<{id:number;title:string}>(
     "UPDATE public.askanus_cases SET status=$3::askanus_status,"+
     "closed_at=CASE WHEN $3='closed' THEN coalesce(closed_at,now()) ELSE NULL END,last_updated=now() "+
     "WHERE id=$1 AND user_id=$2 RETURNING id,title",
     [row.selected_id,userId,row.pending_action]);
    if(updated.rows[0]){
     await client.query("INSERT INTO public.max_history_events"+
      "(user_id,case_id,entity_type,entity_id,action,title,details) "+
      "VALUES($1,$2,'case',$2,$3,$4,$5)",[
       userId,row.selected_id,
       row.pending_action==="closed"?"case_completed":row.pending_action==="open"?"case_reopened":"case_status_changed",
       updated.rows[0].title,JSON.stringify({status:row.pending_action,source:"phone"})]);
     await client.query("INSERT INTO public.case_activity_log(case_id,date,type,note) "+
      "VALUES($1,$2,'status_change',$3)",[
       row.selected_id,new Date().toISOString().slice(0,10),"Status changed by verified phone to "+row.pending_action]);
    }
    await answer("main","The case status is now updated on the website. "+menu);return true;
   }
   await answer("main","Cancelled without a change. "+menu);return true;
  }
  if(row.stage==="capture_followup"){
   const note=cleanSpeech(speech);
   if(!note){
    await answer(row.stage,"Speak your followup note clearly in English. For Yiddish, enter text on the website.","speech",0,row.selected_id);
    return true;
   }
   await answer("followup_date","Followup note: "+note+
    ". Enter due date as eight digits: year, month, day. Or press zero to cancel.",
    "id",0,row.selected_id,note);
   return true;
  }
  if(row.stage==="followup_date"){
   const raw=String(digit||"");
   if(!/^(20[2-9]\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(raw)||
    !Number.isFinite(new Date(raw.slice(0,4)+"-"+raw.slice(4,6)+"-"+raw.slice(6)).getTime())||
    new Date(raw.slice(0,4)+"-"+raw.slice(4,6)+"-"+raw.slice(6)).toISOString().slice(0,10)!==
       raw.slice(0,4)+"-"+raw.slice(4,6)+"-"+raw.slice(6)){
    await answer(row.stage,"Invalid date. Please enter a valid eight digit date, year month day, ending with pound.",
     "id",0,row.selected_id,row.pending_title);return true;
   }
   const due=raw.slice(0,4)+"-"+raw.slice(4,6)+"-"+raw.slice(6);
   await answer("confirm_followup","Create nonrecurring followup for case "+row.selected_id+
    ", due "+due+", note "+row.pending_title+". Press 1 to confirm, or 2 to cancel.",
    "menu",0,row.selected_id,row.pending_title,due);
   return true;
  }
  if(row.stage==="confirm_followup"){
   if(digit==="1"&&row.selected_id&&row.pending_title&&/^\d{4}-\d{2}-\d{2}$/.test(row.pending_action)){
    const owned=await client.query("SELECT id FROM public.askanus_cases WHERE id=$1 AND user_id=$2",
      [row.selected_id,userId]);
    if(!owned.rowCount){await answer("main","Case no longer available. "+menu);return true;}
    const due=row.pending_action;
    const record=await client.query<{id:number}>(
     "INSERT INTO public.case_followups(case_id,date,note,due_date,repeat_rule) "+
     "VALUES($1,$2,$3,$4,'none') RETURNING id",
     [row.selected_id,new Date().toISOString().slice(0,10),row.pending_title,due]);
    await client.query("INSERT INTO public.max_history_events"+
     "(user_id,case_id,entity_type,entity_id,action,title,details) "+
     "VALUES($1,$2,'followup',$3,'followup_created',$4,$5)",[
      userId,row.selected_id,record.rows[0].id,row.pending_title.slice(0,240),
      JSON.stringify({source:"phone",note:row.pending_title,dueDate:due,repeatRule:"none"})]);
    await answer("main","Followup saved to your case and the website. "+menu);return true;
   }
   await answer("main","Cancelled. No followup created. "+menu);return true;
  }
  if(["capture_task","capture_case","capture_note"].includes(row.stage)){
   const title=cleanSpeech(speech);
   if(!title){
    await answer(row.stage,"Speech was not understood. Please speak English clearly. For an exact Yiddish title use the website or a human-reviewed recording.","speech");return true;
   }
   const type=row.stage.replace("capture_","");
   await answer("confirm_create","I heard: "+title+". Press 1 to SAVE a new "+type+
    " to your website account. Press 2 to cancel. No changes were saved yet.",
    "menu",0,null,title,type);
   return true;
  }
  if(row.stage==="confirm_create"){
   if(digit==="1"&&row.pending_title){
    const title=row.pending_title,user=row.user_id;
    if(row.pending_action==="task"){
     await client.query("INSERT INTO public.askanus_tasks(user_id,title,priority) VALUES($1,$2,'medium')",[user,title]);
    }else if(row.pending_action==="note"){
     await client.query("INSERT INTO public.askanus_notes(user_id,title,content) VALUES($1,$2,$3)",[user,title.slice(0,100),title]);
    }else if(row.pending_action==="case"){
     const created=await client.query<{id:number}>(
      "INSERT INTO public.askanus_cases(user_id,title,urgency,category) "+
      "VALUES($1,$2,'medium','General') RETURNING id",[user,title]);
     const id=created.rows[0].id;
     await client.query("INSERT INTO public.case_activity_log(case_id,date,type,note) "+
      "VALUES($1,$2,'status_change','Case opened by verified phone account')",[id,new Date().toISOString().slice(0,10)]);
    }else{
     await answer("main","Unknown action. No changes were made. "+menu);return true;
    }
    await answer("main","Saved to the SAME My Askanus account as your website. "+menu);
    return true;
   }
   await answer("main","Cancelled. No new record saved. "+menu);return true;
  }
  if(row.stage.startsWith("list_")){
   const kind=row.stage.slice(5) as Kind;
   if(!allowed.has(kind)){await answer("main",menu);return true;}
   let n=row.index_no;
   if(digit==="9"){await answer("main",menu);return true;}
   if(digit==="1")n=Math.min(99,n+1);
   if(digit==="8")n=Math.max(0,n-1);
   if(digit==="2")n=0;
   if(digit==="5"){
    const item=await listOne(client,kind,userId,n);
    if(!item){await answer(row.stage,"No record selected. Press 9 menu.", "menu",n);return true;}
    const id=Number(item.id);
    let actions="This record can be reviewed on your website. Press 9 to return.";
    if(kind==="tasks")actions="Press 1 to complete or reopen this task. Press 9 to return to tasks.";
    if(kind==="cases")actions="Press 1 to close or reopen this case. Press 9 to return to cases.";
    if(kind==="followups")actions="Press 1 to complete or reopen this NON RECURRING followup. Press 9 to return.";
    await answer("item_"+kind,recordSummary(kind,item,n)+" "+actions,"menu",n,id);
    return true;
   }
   const x=await listOne(client,kind,userId,n);
   await answer(row.stage,x?recordSummary(kind,x,n)+" 1 next, 8 previous, 2 restart, 5 options, 9 menu.":
    "No more "+kind+". Press 8 previous or 9 menu.","menu",n);
   return true;
  }
  if(row.stage.startsWith("item_")){
   const kind=row.stage.slice(5) as Kind;
   if(!allowed.has(kind)||!row.selected_id){await answer("main",menu);return true;}
   if(digit==="9"){
    const x=await listOne(client,kind,userId,row.index_no);
    await answer(modeStage(kind),x?recordSummary(kind,x,row.index_no)+" 1 next, 5 options, 9 menu.":menu,"menu",row.index_no);
    return true;
   }
   if(digit==="1"&&["tasks","cases","followups"].includes(kind)){
    if(kind==="followups"){
     const check=await client.query<{repeat_rule:string}>(
      "SELECT f.repeat_rule FROM public.case_followups f JOIN public.askanus_cases c ON c.id=f.case_id "+
      "WHERE f.id=$1 AND c.user_id=$2",[row.selected_id,userId]);
     if(check.rows[0]?.repeat_rule!=="none"){
      await answer("main","Recurring followups require calendar logic. Use the website to complete this one safely. "+menu);
      return true;
     }
    }
    await answer("confirm_toggle","Press 1 AGAIN to confirm the status change for "+kind+
     " record "+row.selected_id+". Press 2 to cancel.","menu",row.index_no,row.selected_id,"",kind);
    return true;
   }
   await answer("main",menu);return true;
  }
  if(row.stage==="confirm_toggle"){
   if(digit==="1"&&row.selected_id&&["tasks","cases","followups"].includes(row.pending_action)){
    const id=row.selected_id;
    const today=new Date().toISOString().slice(0,10);
    if(row.pending_action==="tasks"){
     const q=await client.query<{id:number;title:string;completed:boolean}>(
      "UPDATE public.askanus_tasks SET completed=NOT completed,"+
      "completed_at=CASE WHEN NOT completed THEN now() ELSE NULL END "+
      "WHERE id=$1 AND user_id=$2 RETURNING id,title,completed",[id,userId]);
     if(q.rows[0])await client.query("INSERT INTO public.max_history_events"+
      "(user_id,case_id,entity_type,entity_id,action,title,details) "+
      "VALUES($1,NULL,'task',$2,$3,$4,$5)",[
       userId,id,q.rows[0].completed?"task_completed":"task_reopened",q.rows[0].title,
       JSON.stringify({source:"phone",completed:q.rows[0].completed})]);
    }else if(row.pending_action==="cases"){
     const q=await client.query<{id:number;title:string;status:string}>(
      "UPDATE public.askanus_cases SET "+
      "status=CASE WHEN status='closed' THEN 'open'::askanus_status ELSE 'closed'::askanus_status END,"+
      "closed_at=CASE WHEN status='closed' THEN NULL ELSE now() END,last_updated=now() "+
      "WHERE id=$1 AND user_id=$2 RETURNING id,title,status",[id,userId]);
     if(q.rows[0]){
      await client.query("INSERT INTO public.max_history_events"+
       "(user_id,case_id,entity_type,entity_id,action,title,details) "+
       "VALUES($1,$2,'case',$2,$3,$4,$5)",[
        userId,id,q.rows[0].status==="closed"?"case_completed":"case_reopened",
        q.rows[0].title,JSON.stringify({source:"phone",status:q.rows[0].status})]);
      await client.query("INSERT INTO public.case_activity_log(case_id,date,type,note) "+
       "VALUES($1,$2,'status_change',$3)",[id,today,"Case status changed by verified phone to "+q.rows[0].status]);
     }
    }else{
     const q=await client.query<{id:number;case_id:number;note:string;completed:boolean}>(
      "UPDATE public.case_followups SET completed=NOT completed,"+
      "completed_at=CASE WHEN NOT completed THEN now() ELSE NULL END WHERE id=$1 "+
      "AND repeat_rule='none' AND case_id IN "+
      "(SELECT id FROM public.askanus_cases WHERE user_id=$2) "+
      "RETURNING id,case_id,note,completed",[id,userId]);
     if(q.rows[0])await client.query("INSERT INTO public.max_history_events"+
      "(user_id,case_id,entity_type,entity_id,action,title,details) "+
      "VALUES($1,$2,'followup',$3,$4,$5,$6)",[
       userId,q.rows[0].case_id,id,q.rows[0].completed?"followup_completed":"followup_reopened",
       q.rows[0].note.slice(0,240),JSON.stringify({source:"phone",completed:q.rows[0].completed})]);
    }
    await answer("main","Status and history saved on your website account. "+menu);return true;
   }
   await answer("main","No change made. "+menu);return true;
  }
  await answer("main",menu);return true;
 }catch(e){await client.query("ROLLBACK").catch(()=>{});throw e;}
 finally{client.release();}
}

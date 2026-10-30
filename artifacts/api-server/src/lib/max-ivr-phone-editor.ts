/**
 * Signed SignalWire callback -> phone-side IVR configuration editor.
 * Invoked ONLY after the existing shared webhook validates provider signature,
 * dialed number, and route. User then needs a one-time WEB-ISSUED admin code.
 * All telephone edits affect draft tables only. No provider mutations.
 */
import type {Response} from "express";
import {pool} from "@workspace/db";
import {ensureEditor,securityHash,ADMIN_EXTENSION,VOICES,BUILTINS,
 pathAllowed,digitAllowed,saveNode,saveButton,readDraft} from "./max-ivr-editor";

type PhoneState={call_hash:string;user_id:number|null;stage:string;path:string;
 selected_digit:string;failed_attempts:number;expires_at:Date};
const xml=(v:string)=>v.replace(/&/g,"&amp;").replace(/</g,"&lt;")
 .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
function say(res:Response,actionUrl:string,message:string,count=1){
 const prompt=xml(message.slice(0,950));
 // FinishOnKey is needed for variable-length extension paths and 8-digit codes.
 const body='<Gather input="dtmf" action="'+xml(actionUrl)+'" method="POST" '+
  'numDigits="'+count+'" finishOnKey="#" timeout="10"><Say voice="alice">'+prompt+
  '</Say></Gather><Say>Please try again.</Say><Hangup/>';
 res.status(200).type("application/xml; charset=utf-8")
  .set("Cache-Control","no-store").send('<?xml version="1.0" encoding="UTF-8"?><Response>'+body+'</Response>');
}
function end(res:Response,words:string){
 res.status(200).type("application/xml; charset=utf-8").set("Cache-Control","no-store")
  .send('<?xml version="1.0" encoding="UTF-8"?><Response><Say>'+
   xml(words.slice(0,800))+'</Say><Hangup/></Response>');
}
const names=["original","deep","bright","radio","warm","soft"];
const actions=["submenu","read_message","builtin","repeat","back","hangup"] as const;
async function activeAdmin(userId:number){
 const row=await pool.query<{id:number}>(
  "SELECT id FROM public.users WHERE id=$1 AND role='super_admin' AND status NOT IN ('banned','suspended')",[userId]);
 return row.rows[0]?.id===userId;
}
async function setState(callHash:string,stage:string,path:string,digit:string){
 await pool.query("UPDATE public.gavhah_max_ivr_editor_calls "+
  "SET stage=$2,path=$3,selected_digit=$4,updated_at=now() WHERE call_hash=$1",
  [callHash,stage,path,digit]);
}
export async function tryMaxPhoneEditor(input:{
 callHash:string;digit:string|undefined;actionUrl:string;isAtRoot:boolean;res:Response;
}):Promise<boolean>{
 const {callHash,digit,actionUrl,isAtRoot,res}=input;
 // Never handle 55555. Never intercept normal existing calls.
 if(digit==="55555")return false;
 if(digit!==ADMIN_EXTENSION){
  // Read state using existing table if present, with a narrow catch for fresh installs.
  try{
   const s=await pool.query<PhoneState>(
    "SELECT call_hash,user_id,stage,path,selected_digit,failed_attempts,expires_at "+
    "FROM public.gavhah_max_ivr_editor_calls WHERE call_hash=$1 AND expires_at>now()",[callHash]);
   if(!s.rows[0])return false;
  }catch(e){if((e as {code?:string}).code==="42P01")return false;throw e;}
 }else if(!isAtRoot){
  return false;
 }
 await ensureEditor();
 let row=(await pool.query<PhoneState>(
  "SELECT call_hash,user_id,stage,path,selected_digit,failed_attempts,expires_at "+
  "FROM public.gavhah_max_ivr_editor_calls WHERE call_hash=$1 AND expires_at>now()",[callHash])).rows[0];
 if(!row){
  if(digit!==ADMIN_EXTENSION)return false;
  await pool.query(
   "INSERT INTO public.gavhah_max_ivr_editor_calls(call_hash,stage,expires_at) "+
   "VALUES($1,'login',now()+interval '5 minutes') "+
   "ON CONFLICT(call_hash) DO UPDATE SET user_id=NULL,stage='login',path='root',"+
   "selected_digit='',failed_attempts=0,expires_at=now()+interval '5 minutes',updated_at=now()",
   [callHash]);
  say(res,actionUrl,"MAX telephone administration. Get a one time code on your Gavhah admin website. Enter the eight digit code then press pound.",8);
  return true;
 }
 const stage=row.stage,path=row.path,member=row.user_id;
 // Any telephone editor session expires after 20 minutes, even if the call continues.
 if(stage!=="login"&&(!member||!await activeAdmin(member))){
  await pool.query("DELETE FROM public.gavhah_max_ivr_editor_calls WHERE call_hash=$1",[callHash]);
  end(res,"Administrator permission has expired. Goodbye.");return true;
 }
 if(digit===undefined||digit===""){
  if(stage==="login")say(res,actionUrl,"Enter your eight digit website authorization code, then pound.",8);
  else if(stage==="path")say(res,actionUrl,"Enter the extension digits. One digit for the main section or up to twelve digits for nested extensions. Press pound.",12);
  else if(stage==="button")say(res,actionUrl,"Enter the button number, one through nine.",1);
  else if(stage==="action")say(res,actionUrl,"Choose action. 1 nested menu, 2 announcement, 3 existing platform function, 4 repeat, 5 back, 6 hang up.",1);
  else if(stage==="builtin")say(res,actionUrl,"Choose existing website feature. 1 My Tishl, 2 Donor 360, 3 Call Reports, 4 Projects, 5 Finance, 6 Followups, 7 Account.",1);
  else if(stage==="voice")say(res,actionUrl,"Voice style. 1 original, 2 deep, 3 bright, 4 radio, 5 warm, 6 soft.",1);
  else say(res,actionUrl,"MAX editor. 1 select extension, 2 edit a button, 3 change voice style, 4 hear the draft, 9 finish, zero close.",1);
  return true;
 }
 if(stage==="login"){
  if(!/^\d{8}$/.test(digit||"")){
   row.failed_attempts++;
  }else{
   const hash=securityHash("login",digit!);
   // Atomic redeem, with role rechecked. A one-time code cannot be reused.
   const result=await pool.query<{user_id:number}>(
    "UPDATE public.gavhah_max_ivr_edit_codes SET used_at=now() "+
    "WHERE code_hash=$1 AND expires_at>now() AND used_at IS NULL AND EXISTS "+
    "(SELECT 1 FROM public.users WHERE users.id=gavhah_max_ivr_edit_codes.user_id "+
    "AND users.role='super_admin' AND users.status NOT IN ('banned','suspended')) "+
    "RETURNING user_id",[hash]);
   if(result.rows[0]){
    await pool.query("UPDATE public.gavhah_max_ivr_editor_calls "+
     "SET user_id=$2,stage='menu',expires_at=now()+interval '20 minutes',updated_at=now() "+
     "WHERE call_hash=$1",[callHash,result.rows[0].user_id]);
    say(res,actionUrl,"Authorized. MAX editor. 1 select extension, 2 edit a button, 3 change voice style, 4 hear a preview summary, 9 finish, zero close.",1);
    return true;
   }
   row.failed_attempts++;
  }
  await pool.query("UPDATE public.gavhah_max_ivr_editor_calls "+
   "SET failed_attempts=$2,updated_at=now() WHERE call_hash=$1",[callHash,row.failed_attempts]);
  if(row.failed_attempts>=3){
   await pool.query("DELETE FROM public.gavhah_max_ivr_editor_calls WHERE call_hash=$1",[callHash]);
   end(res,"Too many invalid codes. This administration call has been closed.");return true;
  }
  say(res,actionUrl,"Code invalid or expired. Enter the eight digit code from the website, then pound.",8);return true;
 }
 if(digit==="0"||digit==="9"&&stage==="menu"){
  if(digit==="0"){
   await pool.query("DELETE FROM public.gavhah_max_ivr_editor_calls WHERE call_hash=$1",[callHash]);
   end(res,"Editor closed. Existing phone menus remain unchanged.");return true;
  }
  await setState(callHash,"menu",path,"");
  say(res,actionUrl,"All settings are drafts. The live phone number was not changed. 1 extension, 2 button, 3 voice, 4 summary, zero exit.",1);
  return true;
 }
 if(stage==="path"){
  if(!pathAllowed(digit||"")){
   say(res,actionUrl,"Invalid or reserved extension. Please enter another extension path followed by pound.",12);return true;
  }
  await setState(callHash,"menu",digit!,"");
  say(res,actionUrl,"Selected extension "+digit+". 1 choose another, 2 edit button, 3 choose voice style, 4 hear saved draft, zero close.",1);
  return true;
 }
 if(stage==="button"){
  if(!digitAllowed(digit)){say(res,actionUrl,"Button must be one through nine.",1);return true;}
  await setState(callHash,"action",path,digit!);
  say(res,actionUrl,"Button "+digit+". Choose 1 nested submenu, 2 spoken announcement, 3 built in service, 4 repeat, 5 back, 6 hang up.",1);return true;
 }
 if(stage==="action"){
  const choice=Number(digit);
  if(choice<1||choice>6||!Number.isInteger(choice)){say(res,actionUrl,"Choose action one through six.",1);return true;}
  const action=actions[choice-1];
  if(action==="builtin"){
   await setState(callHash,"builtin",path,row.selected_digit);
   say(res,actionUrl,"Built in service: 1 My Tishl, 2 Donor 360, 3 Call Reports, 4 Projects, 5 Finance, 6 Followups, 7 Account.",1);
   return true;
  }
  const target=action==="submenu"?(path==="root"?"":path)+row.selected_digit:"";
  const saved=await saveButton(path,row.selected_digit,{action,label:action,message:"",target},member!);
  if("error" in saved){say(res,actionUrl,"Cannot save this protected button: "+saved.error,1);return true;}
  await setState(callHash,"menu",path,"");
  say(res,actionUrl,"Button "+row.selected_digit+" saved as a draft. It is not live. 1 select extension, 2 another button, 3 voice style, zero close.",1);
  return true;
 }
 if(stage==="builtin"){
  const n=Number(digit);
  if(n<1||n>BUILTINS.length||!Number.isInteger(n)){say(res,actionUrl,"Choose one through seven.",1);return true;}
  const target=BUILTINS[n-1];
  const saved=await saveButton(path,row.selected_digit,{action:"builtin",label:target.replaceAll("_"," "),message:"",target},member!);
  if("error" in saved){say(res,actionUrl,"Cannot save: "+saved.error,1);return true;}
  await setState(callHash,"menu",path,"");
  say(res,actionUrl,"Built in service saved as a draft for button "+row.selected_digit+". 2 another button, zero close.",1);
  return true;
 }
 if(stage==="voice"){
  const n=Number(digit);
  if(n<1||n>VOICES.length||!Number.isInteger(n)){say(res,actionUrl,"Choose voice one through six.",1);return true;}
  const before=await readDraft(path),old=before.node||{};
  const result=await saveNode(path,{title:old.title||"",guide:old.guide||"",
   voicePreset:VOICES[n-1],timeoutSeconds:old.timeout_seconds||8},member!);
  if("error" in result){say(res,actionUrl,"Cannot save voice draft.",1);return true;}
  await setState(callHash,"menu",path,"");
  say(res,actionUrl,"Voice style "+names[n-1]+" selected as draft. For actual spoken voice record or upload an audio file on the website. No live routing changed. 3 choose again, zero exit.",1);
  return true;
 }
 if(stage==="menu"){
  if(digit==="1"){await setState(callHash,"path",path,"");say(res,actionUrl,"Enter the extension digits then pound. Protected 55555 and 4444 are unavailable.",12);return true;}
  if(digit==="2"){await setState(callHash,"button",path,"");say(res,actionUrl,"Enter button one through nine.",1);return true;}
  if(digit==="3"){await setState(callHash,"voice",path,"");say(res,actionUrl,"Voice draft. Press 1 original 2 deep 3 bright 4 radio 5 warm 6 soft.",1);return true;}
  if(digit==="4"){
   const draft=await readDraft(path);
   const txt="Extension "+path+". "+(draft.node?.title||"No label")+". "+
    draft.buttons.map((x:{digit:string;action:string})=>"button "+x.digit+" "+x.action).join(". ");
   say(res,actionUrl,txt.slice(0,800)+" . 1 extension, 2 button, 3 voice, zero close.",1);return true;
  }
 }
 say(res,actionUrl,"Choose 1 extension, 2 button, 3 voice, 4 draft summary, zero exit.",1);
 return true;
}

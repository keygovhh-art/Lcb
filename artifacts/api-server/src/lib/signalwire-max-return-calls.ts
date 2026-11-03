import {createHmac,timingSafeEqual} from "node:crypto";
import type {Request,Response} from "express";
import {pool} from "@workspace/db";
import {checkSignalWireSignature} from "./signalwire-next-hotline";
import {buildOlamTwoAttemptGather} from "./signalwire-olam-silence-policy";
import {normalizedSignalWireNumber} from "./signalwire-number-safety";

const root="https://gavhah-cloudflare-native.keygovhh.workers.dev";
const macKey=()=>String(process.env.SIGNALWIRE_SIGNING_KEY||"");
const active=()=>process.env.OLAM_RETURN_CALL_ROUTING_ENABLED==="true"&&macKey().length>=32;
const esc=(s:string)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;")
 .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
const xml=(s:string)=>'<?xml version="1.0" encoding="UTF-8"?><Response>'+s+'</Response>';
const say=(s:string)=>'<Say voice="man" language="en-US">'+esc(s.slice(0,800))+'</Say>';
const safe=(s:unknown,max=100)=>{
 const v=String(s??"").replace(/<[^>]*>/g,"").replace(/[\u0590-\u05ff\u0600-\u06ff]/g,"")
  .replace(/[^\x20-\x7e]/g," ").trim().replace(/\s+/g," ");
 return v.slice(0,max);
};
const digits=(x:string)=>x.replace(/\D/g,"");
const e164=(x:unknown)=>{
 const s=digits(String(x||""));
 const clean=s.length===11&&s.startsWith("1")?s.slice(1):s;
 return /^[2-9]\d{2}[2-9]\d{6}$/.test(clean)?"+1"+clean:null;
};
const digest=(id:string,kind:string)=>createHmac("sha256",macKey())
 .update("olam-return-calls-v1:"+kind+":"+id).digest("hex");
const action=(id:string,kind:string)=>{
 const path="/api/signalwire/max/return/"+id+"/"+kind;
 return root+path+"?mac="+digest(id,kind);
};
function validate(req:Request,res:Response,kind:string):boolean{
 const id=String(req.params.id||"");
 const got=String(req.query.mac||"");
 const sig=String(req.get("x-signalwire-signature")||req.get("x-twilio-signature")||"");
 const expected=digest(id,kind);
 if(!active()||req.method!=="POST"||!/^\d{1,18}$/.test(id)||
   !/^[a-f0-9]{64}$/.test(got)||!timingSafeEqual(Buffer.from(got,"hex"),Buffer.from(expected,"hex"))||
   !checkSignalWireSignature(macKey(),sig,action(id,kind),req.body)){
  res.status(403).send("Invalid signed return-call request");return false;
 }
 return true;
}
type Match={
 id:string;user_id:number;number_e164:string;
 agent_name:string;purpose:string;public_display_name:string;
 public_purpose:string;unavailable_message:string;
 availability:string;callback_number_e164:string|null;
 share_callback_number:boolean;unavailable_audio_enabled:boolean;
 unavailable_audio_version:number;
};
const recordAlert=async(id:string,uid:number,kind:string,from:string)=>
 pool.query("INSERT INTO public.max_return_alerts(return_call_id,owner_user_id,kind,phone_last4) "+
  "VALUES($1,$2,$3,$4) ON CONFLICT(return_call_id,kind) DO NOTHING",
  [id,uid,kind,from.slice(-4)]);
function voiceName(m:Match){return safe(m.public_display_name||m.agent_name,90)||"our volunteer"}
function voicePurpose(m:Match){return safe(m.public_purpose||m.purpose,120)||"a charitable cause"}
type ReturnCall={id:string;owner_user_id:number;incoming_from:string;provider_call_id:string;
 agent_display_name:string;purpose_text:string;status:string;expires_at:Date};
async function get(id:string,providerSid:string){
 const r=await pool.query<ReturnCall>(
  "SELECT id::text,owner_user_id,incoming_from,provider_call_id,agent_display_name,purpose_text,status,expires_at "+
  "FROM public.max_return_calls WHERE id=$1 AND expires_at>now() AND provider_call_id=$2",
  [id,providerSid]);
 return r.rows[0]||null;
}
function send(res:Response,body:string){
 res.status(200).type("application/xml; charset=utf-8").set("Cache-Control","no-store").send(xml(body));
}

/**
 * Called ONLY after the original shared SignalWire webhook has independently
 * verified its provider signature and the called number. Returning false
 * keeps the unchanged current hotline menu. No provider number re-routing.
 */
export async function maybeHandleOlamReturnCall(req:Request,res:Response):Promise<boolean>{
 if(!active())return false;
 const sid=String(req.body?.CallSid||"");
 const from=e164(req.body?.From);
 const to=normalizedSignalWireNumber(req.body?.To);
 if(!/^[a-zA-Z0-9_.:-]{8,160}$/.test(sid)||!from||to!=="6056558080")return false;
 const source=await pool.query<Match>(
  "SELECT s.id::text,s.user_id,s.number_e164,u.name AS agent_name,"+
  "coalesce(c.title,'') AS purpose,p.public_display_name,p.public_purpose,"+
  "p.unavailable_message,p.availability,p.callback_number_e164,p.share_callback_number,"+
  "p.unavailable_audio_enabled,p.unavailable_audio_version "+
  "FROM public.max_call_sessions s "+
  "JOIN public.users u ON u.id=s.user_id AND u.status='active' "+
  "JOIN public.gavhah_olam_chesed_access access ON access.user_id=u.id AND access.status='linked' "+
  "JOIN public.max_return_call_preferences p ON p.user_id=u.id AND p.enabled=true "+
  "LEFT JOIN public.askanus_cases c ON c.id=s.case_id AND c.user_id=s.user_id "+
  "WHERE s.number_e164=$1 AND s.direction='outbound' AND s.provider_call_id IS NOT NULL "+
  "AND s.status IN ('ringing','in_progress','completed','busy','no_answer') "+
  "AND s.created_at>now()-interval '21 days' ORDER BY s.created_at DESC LIMIT 6",
  [from]);
 const matches=source.rows;
 if(!matches.length)return false;
 // Caller ID is only a hint. Never expose personal donor details; if several
 // staff called within 24 hours, ask the caller to use the general menu.
 const recent=matches.filter(m=>m.user_id!==matches[0].user_id);
 if(recent.length)return false;
 const m=matches[0];
 const intro="Welcome. Volunteer "+voiceName(m)+" called you about "+voicePurpose(m)+
  ". To connect with the volunteer, press 1. To leave a message, press 2.";
 const created=await pool.query<{id:string}>(
  "INSERT INTO public.max_return_calls(owner_user_id,source_session_id,provider_call_id,incoming_from,"+
  "agent_display_name,purpose_text) VALUES($1,$2,$3,$4,$5,$6) "+
  "ON CONFLICT(provider_call_id) DO UPDATE SET updated_at=now() RETURNING id::text",
  [m.user_id,m.id,sid,from,voiceName(m),voicePurpose(m)]);
 const id=created.rows[0].id;
 await recordAlert(id,m.user_id,"incoming",from);
 const gather=buildOlamTwoAttemptGather(action(id,"choice"),1,say(intro),
  say("Please press 1 to connect, or 2 to leave a message."));
 send(res,gather);
 return true;
}
function voicemail(id:string,message:string,announceNumber?:string,audioUrl?:string){
 const intro=audioUrl?'<Play>'+esc(audioUrl)+'</Play>':say(message);
 const phone=announceNumber?say("You can also call the volunteer at "+
  digits(announceNumber).split("").join(" ")+"."):"";
 return intro+phone+say("Please leave a message after the beep. Press pound when finished.")+
  '<Record action="'+esc(action(id,"record"))+
  '" method="POST" maxLength="120" playBeep="true" finishOnKey="#" '+ 
  'recordingStatusCallback="'+esc(action(id,"recordready"))+'" recordingStatusCallbackMethod="POST"/>'+
  '<Hangup/>';
}
async function onUnavailable(id:string,row:ReturnCall,why:"busy"|"yemot"|"unavailable"){
 const p=(await pool.query<{
  unavailable_message:string;share_callback_number:boolean;callback_number_e164:string|null;
  unavailable_audio_enabled:boolean;unavailable_audio_version:number}>(
  "SELECT unavailable_message,share_callback_number,callback_number_e164,"+
  "unavailable_audio_enabled,unavailable_audio_version "+
  "FROM public.max_return_call_preferences WHERE user_id=$1",
  [row.owner_user_id])).rows[0];
 const note=why==="busy"?"The volunteer is currently on another call. "+
  "Please leave a message.":why==="yemot"?
  "The volunteer is currently using a different hotline. "+
  "Please leave a message.":"The volunteer is currently unavailable. Please leave a message.";
 await recordAlert(id,row.owner_user_id,why==="busy"?"busy":why==="yemot"?"yemot":"missed",row.incoming_from);
 await pool.query("UPDATE public.max_return_calls SET status=$2,updated_at=now() WHERE id=$1",
  [id,why==="busy"?"busy":"unavailable"]);
 const audio=p?.unavailable_audio_enabled?
  root+"/api/signalwire/max/return/"+id+"/audio?mac="+digest(id,"audio")+"&v="+p.unavailable_audio_version:null;
 return voicemail(id,safe(p?.unavailable_message,500)||note,
  p?.share_callback_number&&p?.callback_number_e164?p.callback_number_e164:undefined,
  audio||undefined);
}
export async function olamReturnChoice(req:Request,res:Response){
 if(!validate(req,res,"choice"))return;
 const id=String(req.params.id);
 const sid=String(req.body?.CallSid||"");
 const item=await get(id,sid);
 if(!item||!["menu","connecting","voicemail"].includes(item.status)){res.sendStatus(404);return;}
 const key=String(req.body?.Digits||"");
 if(key!=="1"&&key!=="2"){
  send(res,say("No selection received.")+"<Hangup/>");return;
 }
 await pool.query("UPDATE public.max_return_calls SET selected_digit=$2,updated_at=now() WHERE id=$1",
  [id,key]);
 if(key==="2"){
  await pool.query("UPDATE public.max_return_calls SET status='voicemail' WHERE id=$1",[id]);
  send(res,voicemail(id,"Please leave your message."));return;
 }
 const state=(await pool.query<{availability:string;channel:string|null;last_seen_at:Date|null;
   callback_number_e164:string|null}>(
  "SELECT p.availability,a.channel,a.last_seen_at,agent.phone_e164 AS callback_number_e164 "+
  "FROM public.max_return_call_preferences p "+
  "LEFT JOIN public.max_agent_activity a ON a.user_id=p.user_id "+
  "LEFT JOIN public.gavhah_olam_signalwire_agent_numbers agent "+
  " ON agent.user_id=p.user_id AND agent.revoked_at IS NULL "+
  "WHERE p.user_id=$1 AND p.enabled=true",[item.owner_user_id])).rows[0];
 const busy=(await pool.query(
  "SELECT 1 FROM public.max_call_sessions WHERE user_id=$1 "+
  "AND status IN ('initiating','ringing','in_progress') LIMIT 1",[item.owner_user_id])).rowCount;
 const age=state?.last_seen_at?Date.now()-new Date(state.last_seen_at).getTime():Infinity;
 const online=state?.channel==="olam"&&age>=0&&age<45_000;
 const yemot=state?.channel==="yemot"&&age>=0&&age<100_000;
 if(busy){
  send(res,await onUnavailable(id,item,"busy"));return;
 }
 if(yemot){
  send(res,await onUnavailable(id,item,"yemot"));return;
 }
 if(state?.availability!=="auto"||!online||!state.callback_number_e164){
  send(res,await onUnavailable(id,item,"unavailable"));return;
 }
 await pool.query("UPDATE public.max_return_calls SET status='connecting',updated_at=now() WHERE id=$1",[id]);
 const number=state.callback_number_e164;
 // Agent hears a ONE-TIME whisper, never a full keypad-options lecture.
 // They must press 1 before the donor is bridged.
 const dial='<Dial answerOnBridge="true" timeout="22" record="do-not-record" '+
  'callerId="+16056558080" action="'+esc(action(id,"dialdone"))+'" method="POST">'+
  '<Number url="'+esc(action(id,"whisper"))+'" method="POST">'+esc(number)+'</Number></Dial>'+
  '<Redirect method="POST">'+esc(action(id,"fallback"))+'</Redirect>';
 send(res,dial);
}
export async function olamReturnWhisper(req:Request,res:Response){
 if(!validate(req,res,"whisper"))return;
 const id=String(req.params.id);
 const r=(await pool.query<ReturnCall>(
  "SELECT id::text,owner_user_id,incoming_from,provider_call_id,agent_display_name,purpose_text,status,expires_at "+
  "FROM public.max_return_calls WHERE id=$1 AND status='connecting' AND expires_at>now()",[id])).rows[0];
 if(!r){res.sendStatus(404);return;}
 const from=r.incoming_from.slice(-4).split("").join(" ");
 send(res,'<Gather input="dtmf" numDigits="1" timeout="4" action="'+
  esc(action(id,"accept"))+'" method="POST">'+
  say("Incoming call from number ending "+from+". Press 1 to answer.")+
  '</Gather><Hangup/>');
}
export async function olamReturnAccept(req:Request,res:Response){
 if(!validate(req,res,"accept"))return;
 const id=String(req.params.id);
 const matched=(await pool.query(
  "SELECT 1 FROM public.max_return_calls WHERE id=$1 AND status='connecting' AND expires_at>now()",
  [id])).rowCount;
 if(!matched||req.body?.Digits!=="1"){send(res,"<Hangup/>");return;}
 send(res,say("Connecting.") );
}
export async function olamReturnDialDone(req:Request,res:Response){
 if(!validate(req,res,"dialdone"))return;
 const id=String(req.params.id);
 const sid=String(req.body?.CallSid||"");
 const row=await get(id,sid);
 if(!row){res.sendStatus(404);return;}
 const outcome=String(req.body?.DialCallStatus||"");
 if(outcome==="completed"){
  await pool.query("UPDATE public.max_return_calls SET status='completed',updated_at=now() WHERE id=$1",[id]);
  send(res,"<Hangup/>");return;
 }
 send(res,await onUnavailable(id,row,"unavailable"));
}
export async function olamReturnFallback(req:Request,res:Response){
 if(!validate(req,res,"fallback"))return;
 const id=String(req.params.id);
 const row=await get(id,String(req.body?.CallSid||""));
 if(!row){res.sendStatus(404);return;}
 send(res,await onUnavailable(id,row,"unavailable"));
}
const recordingId=(form:Record<string,string>)=>{
 const direct=String(form.RecordingSid||"");
 if(/^[a-zA-Z0-9_.:-]{8,160}$/.test(direct))return direct;
 const url=String(form.RecordingUrl||"");
 const match=/\/Recordings\/([A-Za-z0-9_.:-]{8,160})(?:\.(?:wav|mp3))?(?:\?|$)/.exec(url);
 return match?.[1]||null;
};
export async function olamReturnRecorded(req:Request,res:Response){
 if(!validate(req,res,"record"))return;
 const id=String(req.params.id),sid=String(req.body?.CallSid||"");
 const row=await get(id,sid);
 if(!row){res.sendStatus(404);return;}
 const rec=recordingId(req.body||{});
 const duration=Number(req.body?.RecordingDuration||NaN);
 // RecordingStatusCallback is authoritative when the action omits RecordingSid.
 await pool.query(
  "INSERT INTO public.max_return_voicemails(return_call_id,owner_user_id,recording_sid,duration_seconds) "+
  "VALUES($1,$2,$3,$4) ON CONFLICT(return_call_id) DO UPDATE SET "+
  "recording_sid=COALESCE(max_return_voicemails.recording_sid,EXCLUDED.recording_sid),"+
  "duration_seconds=COALESCE(EXCLUDED.duration_seconds,max_return_voicemails.duration_seconds)",
  [id,row.owner_user_id,rec,Number.isSafeInteger(duration)&&duration>=0?duration:null]);
 await pool.query("UPDATE public.max_return_calls SET status='voicemail',updated_at=now() WHERE id=$1",[id]);
 await recordAlert(id,row.owner_user_id,"voicemail",row.incoming_from);
 send(res,say("Thank you. Your message has been received.")+"<Hangup/>");
}
export async function olamReturnRecordingReady(req:Request,res:Response){
 if(!validate(req,res,"recordready"))return;
 const id=String(req.params.id),sid=String(req.body?.CallSid||"");
 const row=await get(id,sid);
 if(!row){res.sendStatus(404);return;}
 const outcome=String(req.body?.RecordingStatus||"");
 if(outcome!=="completed"){res.sendStatus(204);return;}
 const rec=recordingId(req.body||{});
 if(!rec){res.sendStatus(400);return;}
 const secs=Number(req.body?.RecordingDuration||NaN);
 await pool.query(
  "INSERT INTO public.max_return_voicemails(return_call_id,owner_user_id,recording_sid,duration_seconds) "+
  "VALUES($1,$2,$3,$4) ON CONFLICT(return_call_id) DO UPDATE SET "+
  "recording_sid=EXCLUDED.recording_sid,duration_seconds=COALESCE(EXCLUDED.duration_seconds,"+
  "max_return_voicemails.duration_seconds)",
  [id,row.owner_user_id,rec,Number.isSafeInteger(secs)&&secs>=0?secs:null]);
 await recordAlert(id,row.owner_user_id,"voicemail",row.incoming_from);
 res.sendStatus(204);
}
export async function olamReturnAudio(req:Request,res:Response){
 const id=String(req.params.id||"");
 const mac=String(req.query.mac||"");
 const ver=Number(req.query.v);
 const expected=digest(id,"audio");
 if(!active()||!/^\d{1,18}$/.test(id)||!/^[a-f0-9]{64}$/.test(mac)||
  !timingSafeEqual(Buffer.from(mac,"hex"),Buffer.from(expected,"hex"))||
  !Number.isSafeInteger(ver)||ver<1){res.sendStatus(404);return;}
 const r=await pool.query<{unavailable_audio_data:Buffer}>(
  "SELECT p.unavailable_audio_data FROM public.max_return_calls c "+
  "JOIN public.max_return_call_preferences p ON p.user_id=c.owner_user_id "+
  "WHERE c.id=$1 AND c.expires_at>now() AND p.unavailable_audio_version=$2 "+
  "AND p.unavailable_audio_enabled=true AND p.unavailable_audio_data IS NOT NULL",
  [id,ver]);
 if(!r.rowCount){res.sendStatus(404);return;}
 res.set("Cache-Control","private,no-store").set("X-Content-Type-Options","nosniff")
  .type("audio/wav").send(r.rows[0].unavailable_audio_data);
}
// Local state: do not infer a provider channel is still active from a stale
// Caller ID. Only authenticated member activity refreshes this state.
export async function updateOlamAgentPresence(userId:number,channel:"olam"|"yemot"){
 await pool.query("INSERT INTO public.max_agent_activity(user_id,channel,last_seen_at) "+
  "VALUES($1,$2,now()) ON CONFLICT(user_id) DO UPDATE SET "+
  "channel=EXCLUDED.channel,last_seen_at=now()",[userId,channel]);
}
export async function noteYemotReturnCalls(db:import("pg").PoolClient,userId:number){
 // Consume ONE alert per call for the member; never repeat options.
 const result=await db.query<{id:number}>(
  "SELECT id FROM public.max_return_alerts WHERE owner_user_id=$1 AND kind='yemot' "+
  "AND yemot_announcement_delivered=false ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED",
  [userId]);
 if(!result.rowCount)return "";
 await db.query("UPDATE public.max_return_alerts SET yemot_announcement_delivered=true WHERE id=$1",
  [result.rows[0].id]);
 return "Incoming call on Olam Chesed Communications. "+
  "Please switch to Olam Chesed Communications to contact the caller. ";
}

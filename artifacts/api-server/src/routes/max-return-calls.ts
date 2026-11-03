import {Router,type Request,type Response,type NextFunction} from "express";
import {pool} from "@workspace/db";
import {getSessionUserId,requireAuth} from "../middlewares/auth";
import {updateOlamAgentPresence,olamReturnChoice,olamReturnWhisper,
 olamReturnAccept,olamReturnDialDone,olamReturnFallback,
 olamReturnRecorded,olamReturnAudio} from "../lib/signalwire-max-return-calls";
import {fetchOlamVoicemailAudio} from "../lib/signalwire-max-outbound";
const router=Router();
const step=(fn:(req:Request,res:Response)=>Promise<void>)=>
 (req:Request,res:Response,next:NextFunction)=>{void fn(req,res).catch(next)};
const clean=(x:unknown,max:number)=>String(x??"").trim().slice(0,max);
const e164=(x:unknown)=>{
 const raw=clean(x,32);
 if(!/^[\d+()\-. ]{10,32}$/.test(raw))return null;
 const ds=raw.replace(/\D/g,"");
 const national=ds.length===11&&ds[0]==="1"?ds.slice(1):ds;
 return /^[2-9]\d{2}[2-9]\d{6}$/.test(national)?"+1"+national:null;
};
function sameOrigin(req:Request){
 const origin=req.get("origin"),host=req.get("x-forwarded-host")||req.get("host");
 if(!origin||!host||req.get("sec-fetch-site")==="cross-site")return false;
 try{const u=new URL(origin);return u.protocol==="https:"&&u.host===host}catch{return false}
}
router.post("/signalwire/max/return/:id/choice",step(olamReturnChoice));
router.post("/signalwire/max/return/:id/whisper",step(olamReturnWhisper));
router.post("/signalwire/max/return/:id/accept",step(olamReturnAccept));
router.post("/signalwire/max/return/:id/dialdone",step(olamReturnDialDone));
router.post("/signalwire/max/return/:id/fallback",step(olamReturnFallback));
router.post("/signalwire/max/return/:id/record",step(olamReturnRecorded));
router.get("/signalwire/max/return/:id/audio",step(olamReturnAudio));
router.use("/askanus/max/return-calls",requireAuth);
router.get("/askanus/max/return-calls/preferences",step(async(req,res)=>{
 const userId=getSessionUserId(req)!;
 const p=(await pool.query(
  "SELECT enabled,availability,public_display_name,public_purpose,"+
  "unavailable_message,share_callback_number,callback_number_e164,unavailable_audio_enabled,"+
  "unavailable_audio_data IS NOT NULL AS has_audio,updated_at "+
  "FROM public.max_return_call_preferences WHERE user_id=$1",[userId])).rows[0];
 res.set("Cache-Control","private,no-store").json(p?{
  enabled:p.enabled,availability:p.availability,publicDisplayName:p.public_display_name,
  publicPurpose:p.public_purpose,unavailableMessage:p.unavailable_message,
  shareCallbackNumber:p.share_callback_number,
  callbackNumber:p.callback_number_e164||"",unavailableAudioEnabled:p.unavailable_audio_enabled,
  hasUnavailableAudio:p.has_audio,updatedAt:p.updated_at
 }:{
  enabled:false,availability:"auto",publicDisplayName:"",publicPurpose:"",
  unavailableMessage:"",shareCallbackNumber:false,callbackNumber:"",
  unavailableAudioEnabled:false,hasUnavailableAudio:false
 });
}));
router.put("/askanus/max/return-calls/preferences",step(async(req,res)=>{
 if(!sameOrigin(req)){res.sendStatus(403);return;}
 const id=getSessionUserId(req)!;
 const enabled=req.body?.enabled===true;
 const availability=clean(req.body?.availability,15);
 const name=clean(req.body?.publicDisplayName,100);
 const purpose=clean(req.body?.publicPurpose,150);
 const message=clean(req.body?.unavailableMessage,600);
 const share=req.body?.shareCallbackNumber===true;
 const number=req.body?.callbackNumber?e164(req.body.callbackNumber):null;
 const useAudio=req.body?.unavailableAudioEnabled===true;
 if(!["auto","unavailable"].includes(availability)||
  (share&&!number)||[name,purpose,message].some(t=>t.includes("<")||t.includes(">"))){
  res.status(400).json({error:"Invalid return-call preferences"});return;
 }
 await pool.query(
  "INSERT INTO public.max_return_call_preferences(user_id,enabled,availability,"+
  "public_display_name,public_purpose,unavailable_message,share_callback_number,"+
  "callback_number_e164,unavailable_audio_enabled) "+
  "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) "+
  "ON CONFLICT(user_id) DO UPDATE SET enabled=$2,availability=$3,public_display_name=$4,"+
  "public_purpose=$5,unavailable_message=$6,share_callback_number=$7,callback_number_e164=$8,"+
  "unavailable_audio_enabled=$9,updated_at=now()",
  [id,enabled,availability,name,purpose,message,share,number,useAudio]);
 res.set("Cache-Control","private,no-store").json({saved:true,enabled,availability});
}));
router.post("/askanus/max/return-calls/heartbeat",step(async(req,res)=>{
 if(!sameOrigin(req)){res.sendStatus(403);return;}
 const id=getSessionUserId(req)!;
 await updateOlamAgentPresence(id,"olam");
 res.json({online:true,validForSeconds:45});
}));
router.post("/askanus/max/return-calls/unavailable-audio",step(async(req,res)=>{
 if(!sameOrigin(req)){res.sendStatus(403);return;}
 const id=getSessionUserId(req)!;
 const blob=req.body?.base64;
 if(req.body?.mime!=="audio/wav"||typeof blob!=="string"||blob.length>5300000||
  !/^[A-Za-z0-9+/]+={0,2}$/.test(blob)){
  res.status(415).json({error:"Please upload 16 kHz mono WAV audio below 4 MB"});return;
 }
 const b=Buffer.from(blob,"base64");
 if(b.length<46||b.length>3900000||b.toString("ascii",0,4)!=="RIFF"||
  b.toString("ascii",8,12)!=="WAVE"||b.readUInt16LE(20)!==1||
  b.readUInt16LE(22)!==1||b.readUInt32LE(24)!==16000||
  b.readUInt16LE(34)!==16||b.readUInt32LE(40)+44>b.length){
  res.status(415).json({error:"Invalid 16 kHz mono 16-bit PCM WAV"});return;
 }
 await pool.query(
  "INSERT INTO public.max_return_call_preferences(user_id,unavailable_audio_data,"+
  "unavailable_audio_enabled) VALUES($1,$2,true) "+
  "ON CONFLICT(user_id) DO UPDATE SET unavailable_audio_data=$2,"+
  "unavailable_audio_enabled=true,"+
  "unavailable_audio_version=max_return_call_preferences.unavailable_audio_version+1,"+
  "updated_at=now()",[id,b]);
 res.json({saved:true,hasUnavailableAudio:true});
}));
router.delete("/askanus/max/return-calls/unavailable-audio",step(async(req,res)=>{
 if(!sameOrigin(req)){res.sendStatus(403);return;}
 const id=getSessionUserId(req)!;
 await pool.query(
  "UPDATE public.max_return_call_preferences SET unavailable_audio_data=NULL,"+
  "unavailable_audio_enabled=false,unavailable_audio_version=unavailable_audio_version+1,"+
  "updated_at=now() WHERE user_id=$1",[id]);
 res.json({deleted:true});
}));
router.get("/askanus/max/return-calls/unavailable-audio",step(async(req,res)=>{
 const id=getSessionUserId(req)!;
 const p=(await pool.query<{unavailable_audio_data:Buffer}>(
  "SELECT unavailable_audio_data FROM public.max_return_call_preferences WHERE user_id=$1",
  [id])).rows[0];
 if(!p?.unavailable_audio_data){res.sendStatus(404);return;}
 res.set("Cache-Control","private,no-store").set("X-Content-Type-Options","nosniff")
  .type("audio/wav").send(p.unavailable_audio_data);
}));
router.get("/askanus/max/return-calls/alerts",step(async(req,res)=>{
 const id=getSessionUserId(req)!;
 const rows=await pool.query(
  "SELECT a.id,a.return_call_id,a.kind,a.phone_last4,a.created_at,a.is_read,"+
  "r.status,r.agent_display_name,r.purpose_text "+
  "FROM public.max_return_alerts a "+
  "JOIN public.max_return_calls r ON r.id=a.return_call_id AND r.owner_user_id=a.owner_user_id "+
  "WHERE a.owner_user_id=$1 ORDER BY a.created_at DESC LIMIT 80",[id]);
 res.set("Cache-Control","private,no-store").json(rows.rows.map(x=>({
  id:String(x.id),callId:String(x.return_call_id),kind:x.kind,
  phoneEnding:x.phone_last4,createdAt:x.created_at,isRead:x.is_read,
  status:x.status,purpose:x.purpose_text
 })));
}));
router.post("/askanus/max/return-calls/alerts/:id/read",step(async(req,res)=>{
 if(!sameOrigin(req)){res.sendStatus(403);return;}
 const id=getSessionUserId(req)!;
 const alertId=String(req.params.id||"");
 if(!/^\d{1,18}$/.test(alertId)){res.sendStatus(400);return;}
 const row=await pool.query(
  "UPDATE public.max_return_alerts SET is_read=true WHERE id=$1 AND owner_user_id=$2 RETURNING id",
  [alertId,id]);
 if(!row.rowCount){res.sendStatus(404);return;}
 res.json({read:true});
}));
router.get("/askanus/max/return-calls/voicemails",step(async(req,res)=>{
 const userId=getSessionUserId(req)!;
 const rows=await pool.query(
  "SELECT m.id,m.duration_seconds,m.recorded_at,r.incoming_from,r.purpose_text "+
  "FROM public.max_return_voicemails m JOIN public.max_return_calls r ON r.id=m.return_call_id "+
  "WHERE m.owner_user_id=$1 AND r.owner_user_id=$1 "+
  "ORDER BY m.recorded_at DESC LIMIT 100",[userId]);
 res.set("Cache-Control","private,no-store").json(rows.rows.map(x=>({
  id:String(x.id),durationSeconds:x.duration_seconds,recordedAt:x.recorded_at,
  phoneEnding:String(x.incoming_from).slice(-4),purpose:x.purpose_text
 })));
}));
router.get("/askanus/max/return-calls/voicemails/:id/audio",step(async(req,res)=>{
 const userId=getSessionUserId(req)!;
 const id=String(req.params.id||"");
 if(!/^\d{1,18}$/.test(id)){res.sendStatus(400);return;}
 const p=await pool.query<{recording_sid:string|null}>(
  "SELECT m.recording_sid FROM public.max_return_voicemails m "+
  "JOIN public.max_return_calls r ON r.id=m.return_call_id AND r.owner_user_id=m.owner_user_id "+
  "WHERE m.id=$1 AND m.owner_user_id=$2",[id,userId]);
 if(!p.rowCount||!p.rows[0].recording_sid){res.sendStatus(404);return;}
 const audio=await fetchOlamVoicemailAudio(p.rows[0].recording_sid);
 res.set("Cache-Control","private,no-store").set("X-Content-Type-Options","nosniff")
  .type("audio/wav").send(audio);
}));
export default router;

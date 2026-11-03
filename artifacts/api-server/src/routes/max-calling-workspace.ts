import {Router} from "express";
import {pool} from "@workspace/db";
import {getSessionUserId,requireAuth} from "../middlewares/auth";

const router=Router();
router.use("/askanus/max/calling",requireAuth);
const idok=(v:unknown)=>Number.isSafeInteger(Number(v))&&Number(v)>0;
const str=(v:unknown,max:number)=>String(v??"").trim().slice(0,max);
const outcomes=new Set(["","spoke","donation","no_answer","callback","not_interested","do_not_call","other"]);
const moods=new Set(["","friendly","neutral","busy","uncomfortable","uninterested","other"]);
function normalizeNanp(value:unknown):string|null{
 const raw=String(value??"");
 if(!/^[+\d\s().-]{10,28}$/.test(raw))return null;
 const digits=raw.replace(/\D/g,"");
 const national=digits.length===11&&digits[0]==="1"?digits.slice(1):digits;
 return /^[2-9]\d{2}[2-9]\d{6}$/.test(national)?"+1"+national:null;
}
async function ownedCase(userId:number,id:unknown){
 if(!idok(id))return false;
 const r=await pool.query("SELECT 1 FROM public.askanus_cases WHERE id=$1 AND user_id=$2",[Number(id),userId]);
 return !!r.rowCount;
}
async function ownedContact(userId:number,id:unknown){
 if(!idok(id))return null;
 const r=await pool.query<{do_not_call:boolean}>(
  "SELECT do_not_call FROM public.communication_contacts WHERE id=$1 AND user_id=$2",[Number(id),userId]);
 return r.rows[0]??null;
}
function map(r:any){
 return {id:String(r.id),caseId:r.case_id,contactId:r.contact_id,
  number:r.number_e164,country:r.destination_country,direction:r.direction,
  status:r.status,startedAt:r.started_at,answeredAt:r.answered_at,endedAt:r.ended_at,
  durationSeconds:r.duration_seconds,participantCount:r.participant_count,
  outcome:r.outcome,mood:r.mood,note:r.note,createdAt:r.created_at,
  providerCallIdPresent:!!r.provider_call_id,recordingEnabled:false};
}
router.get("/askanus/max/calling/preferences",async(req,res,next)=>{
 try{
  const userId=getSessionUserId(req)!;
  const p=await pool.query("SELECT * FROM public.max_call_preferences WHERE user_id=$1",[userId]);
  const r=p.rows[0];
  res.set("Cache-Control","private,no-store").json({
   lastCaseId:r?.last_case_id??null,holdMode:r?.hold_mode??"gavhah",
   holdMessage:r?.hold_message??"",holdAudioPath:r?.hold_audio_path??"",
   providerReady:false,recordingEnabled:false,maxParticipants:3,
   keypad:{beforeCall:"1 אויסקלייבן; 2 סקיפן; 3 אפציעס",
    duringCall:"1 ענטפערן; 2 האלטן/צוריק; 3 העכער; 4 שטילער; 5 מעניו; 6 דריי־וועג; 0 הילף",
    fiveMenu:"1 אראפהאקן; 2 רופן נאך איינעם"}
  });
 }catch(e){next(e);}
});
router.put("/askanus/max/calling/preferences",async(req,res,next)=>{
 try{
  const userId=getSessionUserId(req)!;
  const p=await pool.query("SELECT * FROM public.max_call_preferences WHERE user_id=$1",[userId]);
  const previous=p.rows[0];
  const caseId=req.body?.lastCaseId===undefined?(previous?.last_case_id??null):req.body.lastCaseId;
  if(caseId!==null&&!await ownedCase(userId,caseId)){
   res.status(404).json({error:"Project not found"});return;
  }
  const holdMode=str(req.body?.holdMode??previous?.hold_mode??"gavhah",15);
  const holdMessage=str(req.body?.holdMessage??previous?.hold_message??"",700);
  const holdAudioPath=str(req.body?.holdAudioPath??previous?.hold_audio_path??"",300);
  if(!["gavhah","message","audio"].includes(holdMode)||
     (holdMode==="message"&&!holdMessage)||
     (holdMode==="audio"&&!/^\/api\/admin\/max\/ivr-editor\/audio\/[A-Za-z0-9_-]{8,120}$/.test(holdAudioPath))){
   res.status(400).json({error:"Invalid hold announcement or audio selection"});return;
  }
  await pool.query(
   "INSERT INTO public.max_call_preferences(user_id,last_case_id,hold_mode,hold_message,hold_audio_path) "+
   "VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id) DO UPDATE SET "+
   "last_case_id=EXCLUDED.last_case_id,hold_mode=EXCLUDED.hold_mode,hold_message=EXCLUDED.hold_message,"+
   "hold_audio_path=EXCLUDED.hold_audio_path,updated_at=now()",
   [userId,caseId===null?null:Number(caseId),holdMode,holdMessage,holdMode==="audio"?holdAudioPath:""]);
  res.json({saved:true,lastCaseId:caseId,holdMode,holdMessage,holdAudioPath,activatedAtProvider:false});
 }catch(e){next(e);}
});
router.get("/askanus/max/calling/sessions",async(req,res,next)=>{
 try{
  const r=await pool.query("SELECT * FROM public.max_call_sessions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
   [getSessionUserId(req)!]);
  res.set("Cache-Control","private,no-store").json(r.rows.map(map));
 }catch(e){next(e);}
});
router.post("/askanus/max/calling/sessions",async(req,res,next)=>{
 try{
  const userId=getSessionUserId(req)!;
  const number=normalizeNanp(req.body?.number);
  const country=str(req.body?.country,2);
  const caseId=req.body?.caseId==null||req.body?.caseId===""?null:req.body.caseId;
  const contactId=req.body?.contactId==null||req.body?.contactId===""?null:req.body.contactId;
  if(!number||!["US","CA"].includes(country)){
   res.status(400).json({error:"Enter a valid US/Canada +1 number. Provider country lookup is required before dialing."});return;
  }
  if(caseId!==null&&!await ownedCase(userId,caseId)){
   res.status(404).json({error:"Project not found"});return;
  }
  // The number must be blocked even if the caller typed it manually without selecting a contact.
  const blocked=await pool.query(
   "SELECT 1 FROM public.communication_contacts WHERE user_id=$1 AND do_not_call=true "+
   "AND right(regexp_replace(phone,'[^0-9]','','g'),10)=$2 LIMIT 1",
   [userId,number.slice(-10)]);
  if(blocked.rowCount){res.status(409).json({error:"Number is on your Do Not Call list"});return;}
  if(contactId!==null){
   const c=await ownedContact(userId,contactId);
   if(!c){res.status(404).json({error:"Contact not found"});return;}
   if(c.do_not_call){res.status(409).json({error:"Do not call this contact"});return;}
  }
  // Preparing is NOT dialing. No audio recording, no duration fabrication.
  const r=await pool.query(
   "INSERT INTO public.max_call_sessions(user_id,case_id,contact_id,number_e164,destination_country) "+
   "VALUES($1,$2,$3,$4,$5) RETURNING *",
   [userId,caseId===null?null:Number(caseId),contactId===null?null:Number(contactId),number,country]);
  if(caseId!==null){
   await pool.query("INSERT INTO public.max_call_preferences(user_id,last_case_id) VALUES($1,$2) "+
    "ON CONFLICT(user_id) DO UPDATE SET last_case_id=EXCLUDED.last_case_id,updated_at=now()",
    [userId,Number(caseId)]);
  }
  res.status(201).json({...map(r.rows[0]),callInitiated:false,
   message:"דער רוף איז צוגעגרייט, אבער נאכנישט ארויסגעגאנגען."});
 }catch(e){next(e);}
});
router.patch("/askanus/max/calling/sessions/:id",async(req,res,next)=>{
 try{
  const userId=getSessionUserId(req)!;
  if(!idok(req.params.id)){res.status(400).json({error:"Invalid ID"});return;}
  const p=await pool.query("SELECT * FROM public.max_call_sessions WHERE id=$1 AND user_id=$2",
   [req.params.id,userId]);
  if(!p.rowCount){res.status(404).json({error:"Call not found"});return;}
  const old=p.rows[0];
  const caseId=req.body?.caseId===undefined?old.case_id:
   (req.body.caseId===null||req.body.caseId===""?null:req.body.caseId);
  if(caseId!==null&&!await ownedCase(userId,caseId)){res.status(404).json({error:"Project not found"});return;}
  const outcome=str(req.body?.outcome??old.outcome,32);
  const mood=str(req.body?.mood??old.mood,32);
  const note=str(req.body?.note??old.note,2500);
  if(!outcomes.has(outcome)||!moods.has(mood)){res.status(400).json({error:"Invalid outcome"});return;}
  const r=await pool.query(
   "UPDATE public.max_call_sessions SET case_id=$1,outcome=$2,mood=$3,note=$4,updated_at=now() "+
   "WHERE id=$5 AND user_id=$6 RETURNING *",
   [caseId===null?null:Number(caseId),outcome,mood,note,req.params.id,userId]);
  if(caseId!==null){
   await pool.query("INSERT INTO public.max_call_preferences(user_id,last_case_id) VALUES($1,$2) "+
    "ON CONFLICT(user_id) DO UPDATE SET last_case_id=EXCLUDED.last_case_id,updated_at=now()",
    [userId,Number(caseId)]);
  }
  if(outcome==="do_not_call"&&old.contact_id){
   await pool.query(
    "UPDATE public.communication_contacts SET do_not_call=true,opt_out_reason=$1,updated_at=now() "+
    "WHERE id=$2 AND user_id=$3",[note||"Asked not to be called",old.contact_id,userId]);
  }
  res.json(map(r.rows[0]));
 }catch(e){next(e);}
});
// Refuse, rather than pretending, to place or control calls before verified integration.
// Phone-device volume cannot be changed by a remote HTTP API.
router.post("/askanus/max/calling/sessions/:id/dial",requireAuth,(_req,res)=>{
 res.status(503).json({error:"SignalWire MAX outbound calling is not activated. No call placed.",recordingEnabled:false});
});
router.post("/askanus/max/calling/sessions/:id/control",requireAuth,(_req,res)=>{
 res.status(503).json({error:"Live hold, incoming waiting and conference control require a real verified active call.",maxParticipants:3});
});
export default router;

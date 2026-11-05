import {Router,type Request} from "express";
import {pool} from "@workspace/db";
import {requireAuth,requireAdmin,getSessionUserId} from "../middlewares/auth";
import {conferenceOpen,conferenceGate,validConferenceExtension,type ConferenceState} from "../lib/gavhah-unified-conference";

const router=Router();
const sameOrigin=(r:Request)=>{
 const o=r.get("origin"),h=r.get("x-forwarded-host")||r.get("host");
 if(r.get("sec-fetch-site")==="cross-site"||!o||!h)return false;
 try{return new URL(o).host===h&&new URL(o).protocol==="https:";}catch{return false;}
};
const intId=(v:unknown):number|null=>{
 const x=Number(v);return Number.isSafeInteger(x)&&x>0?x:null;
};
const selected=async()=>{
 const r=await pool.query<ConferenceState&{name:string;description:string;max_participants:number}>(
  "SELECT name,description,enabled,provider_confirmed,listener_extension,moderator_extension,"+
  "mode,waiting_room,entry_mode,scheduled_start_at,scheduled_end_at,override_state,override_until,max_participants "+
  "FROM public.gavhah_unified_conference WHERE id=1");
 return r.rows[0];
};
router.get("/conference",async(_req,res,next)=>{
 try{
  const s=await selected();
  if(!s){res.status(503).json({enabled:false,connected:false});return;}
  res.set("Cache-Control","no-store").json({
   name:s.name,description:s.description,enabled:s.enabled,
   connected:s.provider_confirmed,currentlyOpen:conferenceOpen(s),
   waitingRoom:s.waiting_room,entryMode:s.entry_mode,mode:s.mode,
   scheduledStart:s.scheduled_start_at,scheduledEnd:s.scheduled_end_at,
   maxParticipants:s.max_participants,
   accessNotice:"Members must sign in. The member blacklist overrides every allow-list and access code."
  });
 }catch(e){next(e);}
});
router.get("/me/conference",requireAuth,async(req,res,next)=>{
 const c=await pool.connect();
 try{
  const gate=await conferenceGate(c,getSessionUserId(req));
  const hand=await c.query<{state:string}>(
   "SELECT state FROM public.gavhah_unified_conference_hand_requests WHERE member_id=$1",
   [getSessionUserId(req)]);
  // Provider extension is not exposed in browser response or to unapproved users.
  res.set("Cache-Control","private,no-store").json({
   role:gate.role,allowed:gate.allowed,message:gate.reason,
   handState:hand.rows[0]?.state||null,mayRequestHand:gate.role!=="blocked",
   providerConnected:!!gate.providerPath
  });
 }catch(e){next(e);}finally{c.release();}
});
router.post("/me/conference/raise-hand",requireAuth,async(req,res,next)=>{
 if(!sameOrigin(req)){res.sendStatus(403);return;}
 const member=getSessionUserId(req);
 const c=await pool.connect();
 try{
  const gate=await conferenceGate(c,member);
  if(gate.role==="blocked"){res.sendStatus(403);return;}
  const r=await c.query(
   "INSERT INTO public.gavhah_unified_conference_hand_requests(member_id,state) "+
   "VALUES($1,'raised') ON CONFLICT(member_id) DO UPDATE "+
   "SET state='raised',created_at=now(),decided_by=NULL,decided_at=NULL RETURNING state",[member]);
  res.status(201).json({state:r.rows[0].state});
 }catch(e){next(e);}finally{c.release();}
});
router.get("/admin/conference",requireAdmin,async(_req,res,next)=>{
 try{
  const [settings,access,hands,events]=await Promise.all([
   selected(),
   pool.query("SELECT a.member_id,a.access,a.note,a.updated_at,u.name "+
    "FROM public.gavhah_unified_conference_access a "+
    "JOIN public.users u ON u.id=a.member_id "+
    "ORDER BY a.updated_at DESC LIMIT 300"),
   pool.query("SELECT h.member_id,h.state,h.created_at,u.name "+
    "FROM public.gavhah_unified_conference_hand_requests h "+
    "JOIN public.users u ON u.id=h.member_id ORDER BY h.created_at DESC LIMIT 100"),
   pool.query("SELECT id,actor_member_id,event_type,details,created_at "+
    "FROM public.gavhah_unified_conference_events ORDER BY created_at DESC LIMIT 60")
  ]);
  res.set("Cache-Control","private,no-store").json({
   settings,access:access.rows,hands:hands.rows,events:events.rows
  });
 }catch(e){next(e);}
});
router.patch("/admin/conference/settings",requireAdmin,async(req,res,next)=>{
 if(!sameOrigin(req)){res.sendStatus(403);return;}
 const operator=getSessionUserId(req);
 const current=await selected();
 if(!current){res.status(503).json({error:"Conference not installed"});return;}
 const input=req.body||{};
 const name=input.name===undefined?current.name:String(input.name).trim();
 const description=input.description===undefined?current.description:String(input.description).trim();
 const listener=input.listenerExtension===undefined?current.listener_extension:input.listenerExtension;
 const moderator=input.moderatorExtension===undefined?current.moderator_extension:input.moderatorExtension;
 const mode=input.mode===undefined?current.mode:input.mode;
 const entryMode=input.entryMode===undefined?current.entry_mode:input.entryMode;
 const waitingRoom=input.waitingRoom===undefined?current.waiting_room:input.waitingRoom;
 const enabled=input.enabled===undefined?current.enabled:input.enabled;
 const start=input.scheduledStart===undefined?current.scheduled_start_at:input.scheduledStart;
 const end=input.scheduledEnd===undefined?current.scheduled_end_at:input.scheduledEnd;
 const override=input.overrideState===undefined?current.override_state:input.overrideState;
 const until=input.overrideUntil===undefined?current.override_until:input.overrideUntil;
 const capacity=input.maxParticipants===undefined?current.max_participants:input.maxParticipants;
 if(name.length<2||name.length>120||description.length>1400||
  !["lecture","qa","discussion"].includes(mode)||
  !["members","whitelist"].includes(entryMode)||
  !["schedule","force_open","force_closed"].includes(override)||
  typeof waitingRoom!=="boolean"||typeof enabled!=="boolean"||
  !Number.isInteger(capacity)||capacity<2||capacity>1000||
  listener!==null&&!validConferenceExtension(listener)||
  moderator!==null&&!validConferenceExtension(moderator)||
  listener!==null&&listener===moderator||
  start!==null&&(!Number.isFinite(Date.parse(start)))||
  end!==null&&(!Number.isFinite(Date.parse(end)))||
  start!==null&&end!==null&&Date.parse(start)>=Date.parse(end)||
  until!==null&&!Number.isFinite(Date.parse(until))){
  res.status(400).json({error:"Invalid conference path, schedule, access or capacity configuration"});return;
 }
 if(input.providerConfirmed===true){
  res.status(409).json({error:"Provider verification cannot be self-certified here. Yemot confbridge requires a separate verified provider test."});return;
 }
 if(enabled&&!current.provider_confirmed){
  res.status(409).json({error:"The physical Yemot confbridge room has not been verified. Cannot enable public join."});return;
 }
 try{
  const c=await pool.connect();
  try{
   await c.query("BEGIN");
   const r=await c.query(
    "UPDATE public.gavhah_unified_conference SET "+
    "name=$1,description=$2,listener_extension=$3,moderator_extension=$4,"+
    "mode=$5,entry_mode=$6,waiting_room=$7,enabled=$8,"+
    "scheduled_start_at=$9,scheduled_end_at=$10,override_state=$11,override_until=$12,"+
    "max_participants=$13,updated_by=$14,updated_at=now() WHERE id=1 RETURNING id",
    [name,description,listener,moderator,mode,entryMode,waitingRoom,enabled,
     start,end,override,until,capacity,operator]);
   await c.query("INSERT INTO public.gavhah_unified_conference_events "+
    "(actor_member_id,event_type,details) VALUES($1,'settings_updated',$2::jsonb)",[
    operator,JSON.stringify({name,mode,entryMode,enabled,waitingRoom,override,
      listener,moderator,capacity,scheduleStart:start,scheduleEnd:end})]);
   await c.query("COMMIT");
   res.json({ok:true,settings:r.rows[0],providerVerified:current.provider_confirmed});
  }catch(e){await c.query("ROLLBACK").catch(()=>{});throw e;}finally{c.release();}
 }catch(e){next(e);}
});
router.put("/admin/conference/access/:id",requireAdmin,async(req,res,next)=>{
 if(!sameOrigin(req)){res.sendStatus(403);return;}
 const member=intId(req.params.id),access=String(req.body?.access||""),note=String(req.body?.note||"").trim();
 if(!member||!["blacklist","whitelist","speaker","moderator"].includes(access)||note.length>500){
  res.status(400).json({error:"Invalid member, list or note"});return;
 }
 try{
  const found=await pool.query("SELECT id FROM public.users WHERE id=$1 AND status='active'",[member]);
  if(!found.rowCount){res.sendStatus(404);return;}
  await pool.query("INSERT INTO public.gavhah_unified_conference_access(member_id,access,note,set_by) "+
   "VALUES($1,$2,$3,$4) ON CONFLICT(member_id,access) DO UPDATE SET "+
   "note=excluded.note,set_by=excluded.set_by,updated_at=now()",
   [member,access,note,getSessionUserId(req)]);
  await pool.query("INSERT INTO public.gavhah_unified_conference_events "+
   "(actor_member_id,event_type,details) VALUES($1,'access_added',$2::jsonb)",
   [getSessionUserId(req),JSON.stringify({member,access})]);
  res.json({ok:true,member,access});
 }catch(e){next(e);}
});
router.delete("/admin/conference/access/:id/:kind",requireAdmin,async(req,res,next)=>{
 if(!sameOrigin(req)){res.sendStatus(403);return;}
 const member=intId(req.params.id),kind=String(req.params.kind||"");
 if(!member||!["blacklist","whitelist","speaker","moderator"].includes(kind)){
  res.sendStatus(400);return;
 }
 try{
  const result=await pool.query(
   "DELETE FROM public.gavhah_unified_conference_access WHERE member_id=$1 AND access=$2 RETURNING member_id",
   [member,kind]);
  await pool.query("INSERT INTO public.gavhah_unified_conference_events "+
   "(actor_member_id,event_type,details) VALUES($1,'access_removed',$2::jsonb)",
   [getSessionUserId(req),JSON.stringify({member,access:kind})]);
  res.json({ok:true,changed:!!result.rowCount});
 }catch(e){next(e);}
});
router.post("/admin/conference/hands/:id",requireAdmin,async(req,res,next)=>{
 if(!sameOrigin(req)){res.sendStatus(403);return;}
 const member=intId(req.params.id),decision=String(req.body?.decision||"");
 if(!member||!["approved","dismissed"].includes(decision)){
  res.status(400).json({error:"Invalid member or hand decision"});return;
 }
 const c=await pool.connect();
 try{
  await c.query("BEGIN");
  const result=await c.query(
   "UPDATE public.gavhah_unified_conference_hand_requests "+
   "SET state=$2,decided_by=$3,decided_at=now() WHERE member_id=$1 AND state='raised' RETURNING member_id",
   [member,decision,getSessionUserId(req)]);
  if(!result.rowCount){await c.query("ROLLBACK");res.sendStatus(409);return;}
  if(decision==="approved"){
   await c.query("INSERT INTO public.gavhah_unified_conference_access(member_id,access,note,set_by) "+
    "VALUES($1,'speaker','Moderator approved microphone request',$2) "+
    "ON CONFLICT(member_id,access) DO UPDATE SET "+
    "set_by=excluded.set_by,updated_at=now()",
    [member,getSessionUserId(req)]);
  }
  await c.query("INSERT INTO public.gavhah_unified_conference_events "+
   "(actor_member_id,event_type,details) VALUES($1,'hand_'+$2,$3::jsonb)",
   [getSessionUserId(req),decision,JSON.stringify({member})]);
  await c.query("COMMIT");
  // Real-time microphone unmute on Yemot is separate provider integration.
  res.json({ok:true,decision,providerMicrophoneChanged:false});
 }catch(e){await c.query("ROLLBACK").catch(()=>{});next(e);}finally{c.release();}
});
export default router;

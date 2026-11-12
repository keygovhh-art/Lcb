import {Router} from "express";
import {pool} from "@workspace/db";
import {getSessionUserId, requireAuth} from "../middlewares/auth";
import {reconcileOlamCallFinance} from "../lib/olam-max-call-finance";
import {placeOlamMaxOutboundCall} from "../lib/signalwire-max-outbound";
import {verifyMaxCampaignDialClaim} from "./communications-connect";

/**
 * Approved Olam MAX calling desk.
 * This integrates existing max_call_sessions, communication_contacts,
 * askanus_cases, and gavhah_olam_desk_direct; it is NOT a new system.
 * STAGING ONLY until live Cloudflare v295 is source-reconciled.
 */
const router=Router();
router.use("/askanus/max/calling/approved",requireAuth);
const toText=(v:unknown,n:number)=>String(v??"").trim().slice(0,n);
const validId=(v:unknown)=>Number.isSafeInteger(Number(v))&&Number(v)>0;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const results=new Set(["","spoke","donation","no_answer","callback","not_interested","asked_no_more","do_not_call","other","pledge"]);
const moodValues=new Set(["","friendly","neutral","busy","uncomfortable","uninterested","other"]);
const phone=(x:unknown)=>{
 const raw=String(x??"");
 if(!/^[+\d\s().-]{10,30}$/.test(raw))return null;
 const d=raw.replace(/\D/g,"");
 const p=d.length===11&&d.startsWith("1")?d.slice(1):d;
 return /^[2-9]\d{2}[2-9]\d{6}$/.test(p)?"+1"+p:null;
};
const ownedCase=async(uid:number,id:number)=>!!(await pool.query(
 "SELECT 1 FROM public.askanus_cases WHERE id=$1 AND user_id=$2",[id,uid])).rowCount;
const normalizeDetails=(b:any)=>{
 const outcome=toText(b?.outcome,32),mood=toText(b?.mood,32),note=toText(b?.note,2500);
 if(!results.has(outcome)||!moodValues.has(mood))return null;
 const warmth=b?.donationWarmth===undefined?"":toText(b.donationWarmth,32);
 if(!["","very_warm","very_generous","warm","generous"].includes(warmth))return null;
 const moneyKind=b?.moneyKind===undefined?"none":toText(b.moneyKind,20);
 if(!["none","donation","pledge"].includes(moneyKind))return null;
 const amount=b?.amount===undefined||b?.amount===null?null:Number(b.amount);
 if(amount!==null&&(!Number.isFinite(amount)||amount<0||amount>100000000||Math.round(amount*100)!==amount*100))return null;
 const callbackAt=b?.callbackAt==null?null:new Date(b.callbackAt);
 if(callbackAt&&(!Number.isFinite(callbackAt.getTime())||callbackAt.getTime()<=Date.now()))return null;
 const details={moneyKind,amount,donationWarmth:warmth,callbackAt:callbackAt?.toISOString()??null};
 return {outcome,mood,note,details};
};
const dncCheck=async(uid:number,p:string)=>!!(await pool.query(
 "SELECT 1 FROM public.communication_contacts WHERE user_id=$1 AND do_not_call=true AND RIGHT(regexp_replace(phone,'[^0-9]','','g'),10)=$2 LIMIT 1",
 [uid,p.slice(-10)])).rowCount;

router.get("/askanus/max/calling/approved/context",async(req,res,next)=>{
 try{
  const uid=getSessionUserId(req)!;
  const [p,c]=await Promise.all([
   pool.query("SELECT last_case_id FROM public.max_call_preferences WHERE user_id=$1",[uid]),
   pool.query("SELECT id,title FROM public.askanus_cases WHERE user_id=$1 AND status IN ('open','in_progress') ORDER BY last_updated DESC LIMIT 100",[uid])
  ]);
  res.set("Cache-Control","private,no-store").json({lastUsedCaseId:p.rows[0]?.last_case_id??null,cases:c.rows,
   permittedSources:["case","none"],campaignSelectionRequiresMembershipVerification:true});
 }catch(e){next(e);}
});

router.get("/askanus/max/calling/approved/history",async(req,res,next)=>{
 try{
  const uid=getSessionUserId(req)!;
  const r=await pool.query(
   "SELECT id,number_e164,provider,reporting_source,status,outcome,mood,note,report_details,case_id,contact_id,created_at,started_at,ended_at,duration_seconds FROM public.max_call_sessions "+
   "WHERE user_id=$1 AND history_hidden_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 200",[uid]);
  res.set("Cache-Control","private,no-store").json({items:r.rows,recordingEnabled:false});
 }catch(e){next(e);}
});

router.post("/askanus/max/calling/approved/manual",async(req,res,next)=>{
 try{
  const uid=getSessionUserId(req)!,p=phone(req.body?.number),report=normalizeDetails(req.body);
  const key=toText(req.body?.requestId,40),caseId=req.body?.caseId==null?null:Number(req.body.caseId);
  if(!p||!report||!uuid.test(key)||caseId!==null&&(!validId(caseId)||!await ownedCase(uid,caseId))){
   res.status(400).json({error:"Valid number, case and one-time request ID required"});return;
  }
  // A manual report is NOT a verified provider call and never receives guessed duration.
  if(req.body?.country!=="US"&&req.body?.country!=="CA"){res.status(400).json({error:"US/CA must be explicitly selected"});return;}
  const q=await pool.query(
   "INSERT INTO public.max_call_sessions(user_id,case_id,number_e164,destination_country,status,provider,reporting_source,outcome,mood,note,report_details,purpose_type,purpose_key,manual_request_id) "+
   "VALUES($1,$2,$3,$4,'completed','manual','manual',$5,$6,$7,$8::jsonb,$9,$10,$11::uuid) "+
   "ON CONFLICT(user_id,manual_request_id) WHERE manual_request_id IS NOT NULL DO NOTHING RETURNING id",
   [uid,caseId,p,req.body.country,report.outcome,report.mood,report.note,JSON.stringify(report.details),caseId===null?"none":"case",caseId===null?null:String(caseId),key]);
  if(caseId!==null&&q.rowCount)await pool.query(
   "INSERT INTO public.max_call_preferences(user_id,last_case_id) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET last_case_id=EXCLUDED.last_case_id,updated_at=now()",[uid,caseId]);
  const old=q.rows[0]|| (await pool.query("SELECT id FROM public.max_call_sessions WHERE user_id=$1 AND manual_request_id=$2::uuid",[uid,key])).rows[0];
  const financial=await reconcileOlamCallFinance(uid,Number(old.id));
  res.status(q.rowCount?201:200).json({id:old?.id,duplicate:!q.rowCount,providerVerified:false,
   statisticsSaved:true,finance:financial});
 }catch(e){next(e);}
});

router.patch("/askanus/max/calling/approved/history/:id",async(req,res,next)=>{
 try{
  const uid=getSessionUserId(req)!,id=Number(req.params.id);
  if(!validId(id)){res.sendStatus(400);return;}
  const owned=(await pool.query("SELECT case_id,contact_id,number_e164,outcome,mood,note,report_details FROM public.max_call_sessions WHERE id=$1 AND user_id=$2 AND history_hidden_at IS NULL",[id,uid])).rows[0];
  if(!owned){res.sendStatus(404);return;}
  // Editing a single field must not clear any other already-saved statistics.
  const prior=owned.report_details||{};
  const merged={...prior,outcome:owned.outcome,mood:owned.mood,note:owned.note,...req.body};
  const edited=normalizeDetails(merged);
  if(!edited){res.status(400).json({error:"Invalid statistics field"});return;}
  const caseId=req.body.caseId===undefined?owned.case_id:req.body.caseId===null?null:Number(req.body.caseId);
  if(caseId!==null&&(!validId(caseId)||!await ownedCase(uid,caseId))){res.sendStatus(404);return;}
  const q=await pool.query(
   "UPDATE public.max_call_sessions SET case_id=$1,purpose_type=$2,purpose_key=$3,outcome=$4,mood=$5,note=$6,report_details=$7::jsonb,updated_at=now() "+
   "WHERE id=$8 AND user_id=$9 AND history_hidden_at IS NULL RETURNING id",
   [caseId,caseId===null?"none":"case",caseId===null?null:String(caseId),edited.outcome,edited.mood,edited.note,JSON.stringify(edited.details),id,uid]);
  if(edited.outcome==="do_not_call"&&owned.contact_id){
   await pool.query("UPDATE public.communication_contacts SET do_not_call=true,opt_out_reason=$1,updated_at=now() WHERE id=$2 AND user_id=$3",[edited.note||"Do Not Call request",owned.contact_id,uid]);
  }
  const finance=await reconcileOlamCallFinance(uid,id);
  res.json({saved:!!q.rowCount,finance});
 }catch(e){next(e);}
});

router.delete("/askanus/max/calling/approved/history/:id",async(req,res,next)=>{
 try{
  const uid=getSessionUserId(req)!,id=Number(req.params.id);
  if(!validId(id)||req.body?.confirm!=="HIDE_THIS_CALL_ONLY"){res.status(400).json({error:"Explicit call-only confirmation required"});return;}
  const q=await pool.query("UPDATE public.max_call_sessions SET history_hidden_at=now(),updated_at=now() WHERE user_id=$1 AND id=$2 AND history_hidden_at IS NULL RETURNING id",[uid,id]);
  res.status(q.rowCount?200:404).json({hidden:!!q.rowCount,contactPreserved:true,financialRecordsPreserved:true});
 }catch(e){next(e);}
});

router.post("/askanus/max/calling/approved/contact",async(req,res,next)=>{
 try{
  const uid=getSessionUserId(req)!,p=phone(req.body?.number),name=toText(req.body?.name,150),address=toText(req.body?.address,550);
  if(!p||!name){res.status(400).json({error:"Phone number and name required; address may be skipped"});return;}
  const x=await pool.query(
   "SELECT id FROM public.communication_contacts WHERE user_id=$1 AND RIGHT(regexp_replace(phone,'[^0-9]','','g'),10)=$2 ORDER BY id LIMIT 1",[uid,p.slice(-10)]);
  if(x.rowCount){res.status(409).json({error:"Contact already saved",id:x.rows[0].id});return;}
  const q=await pool.query("INSERT INTO public.communication_contacts(user_id,name,phone,postal_address) VALUES($1,$2,$3,$4) RETURNING id",[uid,name,p,address]);
  res.status(201).json({saved:true,id:q.rows[0].id,donor360Linked:true});
 }catch(e){next(e);}
});

router.post("/askanus/max/calling/approved/schedule",async(req,res,next)=>{
 try{
  const uid=getSessionUserId(req)!,p=phone(req.body?.number),due=new Date(req.body?.dueAt);
  if(!p||!Number.isFinite(due.getTime())||due.getTime()<=Date.now()||due.getTime()>Date.now()+366*86400000){
   res.status(400).json({error:"Valid number and future date within one year required"});return;
  }
  const r=await pool.query(
   "INSERT INTO public.gavhah_olam_desk_direct(user_id,kind,title,phone_e164,due_at) VALUES($1,'call_later',$2,$3,$4) RETURNING id,due_at",
   [uid,"סקעדזשועלטע קאל — "+p,p,due.toISOString()]);
  res.status(201).json({saved:true,id:r.rows[0].id,dueAt:r.rows[0].due_at,
   tishlVisibleAt:new Date(due.getTime()-25*60000).toISOString(),automaticDial:false});
 }catch(e){next(e);}
});
router.get("/askanus/max/calling/approved/scheduled-due",async(req,res,next)=>{
 try{
  const uid=getSessionUserId(req)!;
  const r=await pool.query(
   "SELECT id,title,phone_e164,due_at FROM public.gavhah_olam_desk_direct "+
   "WHERE user_id=$1 AND kind='call_later' AND status='open' AND due_at<=now()+interval '25 minutes' ORDER BY due_at,id LIMIT 100",[uid]);
  res.set("Cache-Control","private,no-store").json({items:r.rows,automaticDial:false});
 }catch(e){next(e);}
});

/** Individual call screen: the six actions operate on this specific call. */
router.get("/askanus/max/calling/approved/history/:id",async(req,res,next)=>{
 try{
  const uid=getSessionUserId(req)!,id=Number(req.params.id);
  if(!validId(id)){res.status(400).json({error:"Invalid call"});return;}
  const r=await pool.query(
   "SELECT id,number_e164,provider,status,reporting_source,case_id,contact_id,outcome,mood,note,report_details,"+
   "created_at,started_at,answered_at,ended_at,duration_seconds "+
   "FROM public.max_call_sessions WHERE user_id=$1 AND id=$2 AND history_hidden_at IS NULL",[uid,id]);
  if(!r.rowCount){res.sendStatus(404);return;}
  res.set("Cache-Control","private,no-store").json({call:r.rows[0],options:{
   "1":"redial","2":"listen_saved_statistics","3":"enter_missing_statistics",
   "4":"edit_selected_field","5":"save_contact","6":"hide_this_log_only"},providerRecorded:r.rows[0].provider!=="manual"});
 }catch(e){next(e);}
});

router.post("/askanus/max/calling/approved/history/:id/redial",async(req,res,next)=>{
 try{
  const uid=getSessionUserId(req)!,id=Number(req.params.id);
  if(!validId(id)){res.status(400).json({error:"Invalid call"});return;}
  const prior=(await pool.query(
   "SELECT number_e164,case_id,contact_id,destination_country,cc_campaign_id,cc_contact_id "+
   "FROM public.max_call_sessions WHERE id=$1 AND user_id=$2 AND history_hidden_at IS NULL",[id,uid])).rows[0];
  if(!prior){res.sendStatus(404);return;}
  if(await dncCheck(uid,prior.number_e164)){
   res.status(409).json({error:"Do Not Call contact; no redial permitted"});return;
  }
  if(prior.contact_id){
   const contact=await pool.query("SELECT do_not_call FROM public.communication_contacts WHERE user_id=$1 AND id=$2",[uid,prior.contact_id]);
   if(contact.rows[0]?.do_not_call){res.status(409).json({error:"Contact refuses calls"});return;}
  }
  const asked=await pool.query(
   "SELECT 1 FROM public.max_call_sessions WHERE user_id=$1 AND number_e164=$2 "+
   "AND outcome='asked_no_more' LIMIT 1",[uid,prior.number_e164]);
  if(asked.rowCount&&req.body?.confirmAskedNoMore!==true){
   res.status(409).json({error:"The person previously asked not to be called again",requiresConfirmation:true});return;
  }
  const hasCampaign=prior.cc_campaign_id&&prior.cc_contact_id;
  if((prior.cc_campaign_id||prior.cc_contact_id)&&!hasCampaign){res.status(409).json({error:"Incomplete campaign claim"});return;}
  // Provider verification, exclusive campaign claim and DNC are checked again
  // inside placeOlamMaxOutboundCall immediately before any billable dial.
  const prepared=await pool.query(
   "INSERT INTO public.max_call_sessions(user_id,case_id,contact_id,number_e164,destination_country,cc_campaign_id,cc_contact_id) "+
   "VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
   [uid,prior.case_id,prior.contact_id,prior.number_e164,prior.destination_country,
    hasCampaign?prior.cc_campaign_id:null,hasCampaign?prior.cc_contact_id:null]);
  const newId=Number(prepared.rows[0].id);
  if(req.body?.provider==="yemot"){
   res.status(201).json({prepared:true,callInitiated:false,id:newId,reason:"Yemot cannot originate outbound calls; use SignalWire"});return;
  }
  if(req.body?.provider!=="signalwire"){
   res.status(201).json({prepared:true,callInitiated:false,id:newId,reason:"Provider confirmation required"});return;
  }
  const placed=await placeOlamMaxOutboundCall(uid,String(newId),verifyMaxCampaignDialClaim);
  res.set("Cache-Control","private,no-store").json({newCallId:newId,...placed});
 }catch(e){
  const status=(e as any)?.status;
  if(typeof status==="number"&&status>=400&&status<=503){
   res.status(status).json({error:String((e as Error).message),callInitiated:false});return;
  }
  next(e);
 }
});

router.post("/askanus/max/calling/approved/history/:id/contact",async(req,res,next)=>{
 try{
  const uid=getSessionUserId(req)!,id=Number(req.params.id),name=toText(req.body?.name,150),address=toText(req.body?.address,550);
  if(!validId(id)||!name){res.status(400).json({error:"Name required; address may be skipped"});return;}
  const r=await pool.query("SELECT number_e164 FROM public.max_call_sessions WHERE id=$1 AND user_id=$2 AND history_hidden_at IS NULL",[id,uid]);
  if(!r.rowCount){res.sendStatus(404);return;}
  const p=phone(r.rows[0].number_e164)!;
  const existing=await pool.query(
   "SELECT id FROM public.communication_contacts WHERE user_id=$1 AND RIGHT(regexp_replace(phone,'[^0-9]','','g'),10)=$2 LIMIT 1",[uid,p.slice(-10)]);
  if(existing.rowCount){res.status(409).json({error:"Contact already exists",id:existing.rows[0].id});return;}
  const q=await pool.query("INSERT INTO public.communication_contacts(user_id,name,phone,postal_address) VALUES($1,$2,$3,$4) RETURNING id",[uid,name,p,address]);
  await pool.query("UPDATE public.max_call_sessions SET contact_id=$1 WHERE id=$2 AND user_id=$3",[q.rows[0].id,id,uid]);
  res.status(201).json({saved:true,id:q.rows[0].id,donor360Linked:true});
 }catch(e){next(e);}
});

export default router;

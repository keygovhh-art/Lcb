import {Router} from "express";
import {pool} from "@workspace/db";
import {getSessionUserId,requireAuth} from "../middlewares/auth";
import {contactsMain,contactsName,contactsItemActions,contactsOrder,
 contactsSearchActions,contactsDateModes,contactsEditFields,contactsOtherOutcomes,
 contactsWarmth,contactPolicy} from "../lib/olam-max-contacts-menu";

/** The same owner-scoped Contacts and call records serve web, Yemot and SignalWire. */
const router=Router();
const clean=(v:unknown,n=200)=>String(v??"").trim().slice(0,n);
const idOk=(v:unknown)=>Number.isSafeInteger(Number(v))&&Number(v)>0;
const phone=(v:unknown)=>{
 const raw=clean(v,40);
 if(!/^[+\d\s().-]{10,40}$/.test(raw))return null;
 let d=raw.replace(/\D/g,"");
 if(d.length===11&&d.startsWith("1"))d=d.slice(1);
 return /^[2-9]\d{2}[2-9]\d{6}$/.test(d)?"+1"+d:null;
};
const dateOk=(v:unknown)=>{
 const s=clean(v,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;
 const d=new Date(s+"T12:00:00Z");
 return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s?s:null;
};
const categories=new Set(["all","missed_incoming","callable_now","callback_donation",
 "pledge_pending","warm","very_warm","very_generous","generous","do_not_call",
 "donation","no_answer","not_interested","asked_no_more","pledge","callback","other","unreported"]);
const baseListJoin=" LEFT JOIN LATERAL (SELECT r.outcome,r.call_status,r.note,r.mood,"+
 "r.details,r.recorded_at,r.call_id,r.case_id FROM public.max_call_status_revisions r "+
 "WHERE r.user_id=c.user_id AND r.contact_id=c.id "+
 "ORDER BY r.recorded_at DESC,r.id DESC LIMIT 1) last_call ON true ";
function categorySql(kind:string):string{
 switch(kind){
  case "missed_incoming":return "EXISTS (SELECT 1 FROM public.max_call_sessions m WHERE m.user_id=c.user_id AND m.contact_id=c.id AND m.direction='inbound' AND (m.status='no_answer' OR m.outcome='no_answer'))";
  case "callable_now":return "c.do_not_call=false AND (EXISTS (SELECT 1 FROM public.max_contact_recontact_rules r WHERE r.user_id=c.user_id AND r.contact_id=c.id AND r.next_allowed_at<=now()) OR EXISTS (SELECT 1 FROM public.max_donor_recontact d WHERE d.user_id=c.user_id AND d.contact_id=c.id AND d.status='waiting' AND d.due_at<=now()))";
  case "callback_donation":return "c.do_not_call=false AND (EXISTS (SELECT 1 FROM public.max_donor_recontact d WHERE d.user_id=c.user_id AND d.contact_id=c.id AND d.status='waiting') OR last_call.outcome='callback')";
  case "pledge_pending":return "EXISTS (SELECT 1 FROM public.max_pledges p WHERE p.user_id=c.user_id AND p.contact_id=c.id AND p.amount>p.paid_amount AND p.status NOT IN ('cancelled','canceled','rejected'))";
  case "warm":return "last_call.details->>'donationWarmth' IN ('very_warm','very_generous','warm','generous')";
  case "very_warm":case "very_generous":case "generous":return "last_call.details->>'donationWarmth'='"+kind+"'";
  case "do_not_call":return "c.do_not_call=true";
  case "unreported":return "(last_call.outcome IS NULL OR last_call.outcome='')";
  case "donation":case "no_answer":case "not_interested":case "asked_no_more":
  case "pledge":case "callback":case "other":return "last_call.outcome='"+kind+"'";
  default:return "true";
 }
}
async function own(uid:number,id:number){
 const r=await pool.query("SELECT id,contact_number,name,phone,email,notes,postal_address,do_not_call,preferred_hours,contact_role,created_at FROM public.communication_contacts WHERE user_id=$1 AND id=$2 AND hidden_at IS NULL",[uid,id]);
 return r.rows[0]||null;
}
router.get("/askanus/max/contacts/menu",requireAuth,(_req,res)=>{
 res.set("Cache-Control","private,no-store").json({name:contactsName,main:contactsMain,
 item:contactsItemActions,order:contactsOrder,edit:contactsEditFields,
 search:contactsSearchActions,dates:contactsDateModes,otherOutcomes:contactsOtherOutcomes,
 warmth:contactsWarmth,policy:contactPolicy});
});
router.get("/askanus/max/contacts",requireAuth,async(req,res,next)=>{
 try{
  const uid=getSessionUserId(req)!;
  const category=clean(req.query.category||"all",40);
  if(!categories.has(category)){res.status(400).json({error:"Invalid category"});return;}
  const order=req.query.order==="oldest"?"ASC":"DESC";
  const limit=Math.min(100,Math.max(1,Number(req.query.limit)||30));
  const offset=Math.min(50000,Math.max(0,Number(req.query.offset)||0));
  if(!Number.isSafeInteger(limit)||!Number.isSafeInteger(offset)){res.sendStatus(400);return;}
  const args:unknown[]=[uid];
  const filters=["c.user_id=$1","c.hidden_at IS NULL",categorySql(category)];
  if(req.query.phone!==undefined){
   const digits=clean(req.query.phone,30).replace(/\D/g,"");
   if(!digits){res.status(400).json({error:"Phone digits required"});return;}
   args.push("%"+digits+"%");
   filters.push("regexp_replace(c.phone,'[^0-9]','','g') LIKE $"+args.length);
  }
  if(req.query.contactNumber!==undefined){
   if(!idOk(req.query.contactNumber)){res.status(400).json({error:"Invalid contact ID"});return;}
   args.push(Number(req.query.contactNumber));
   filters.push("c.contact_number=$"+args.length);
  }
  if(req.query.callDate!==undefined){
   const date=dateOk(req.query.callDate);
   if(!date){res.status(400).json({error:"Date must be YYYY-MM-DD"});return;}
   args.push(date);
   filters.push("EXISTS (SELECT 1 FROM public.max_call_sessions hist WHERE hist.user_id=c.user_id AND hist.contact_id=c.id AND (coalesce(hist.started_at,hist.created_at) AT TIME ZONE 'America/New_York')::date=$"+args.length+"::date)");
  }
  args.push(limit,offset);
  const sql="SELECT c.id,c.contact_number,c.name,c.phone,c.postal_address,c.do_not_call,c.created_at,"+
   "last_call.outcome AS current_outcome,last_call.call_status AS current_call_status,"+
   "last_call.details AS current_details,last_call.recorded_at AS current_recorded_at,"+
   "(SELECT count(*)::int FROM public.max_call_sessions h WHERE h.user_id=c.user_id AND h.contact_id=c.id) AS calls "+
   "FROM public.communication_contacts c "+baseListJoin+
   " WHERE "+filters.join(" AND ")+" ORDER BY c.created_at "+order+",c.id "+order+
   " LIMIT $"+(args.length-1)+" OFFSET $"+args.length;
  const q=await pool.query(sql,args);
  res.set("Cache-Control","private,no-store").json({category,order:order==="ASC"?"oldest":"newest",
   items:q.rows,hasMore:q.rows.length===limit,nextOffset:offset+q.rows.length,
   categoryListAutoStarts:true,searchKey:"1",nextKey:"#",backKey:"*"});
 }catch(e){next(e);}
});
router.get("/askanus/max/contacts/:id",requireAuth,async(req,res,next)=>{
 try{
  const uid=getSessionUserId(req)!,id=Number(req.params.id);
  if(!idOk(id)){res.sendStatus(400);return;}
  const contact=await own(uid,id);
  if(!contact){res.sendStatus(404);return;}
  const [revs,rules]=await Promise.all([
   pool.query("SELECT call_id,revision,outcome,call_status,case_id,note,mood,details,recorded_at "+
    "FROM public.max_call_status_revisions WHERE user_id=$1 AND contact_id=$2 "+
    "ORDER BY recorded_at DESC,id DESC LIMIT 250",[uid,id]),
   pool.query("SELECT scope_type,scope_id,interval_months,last_contact_at,next_allowed_at "+
    "FROM public.max_contact_recontact_rules WHERE user_id=$1 AND contact_id=$2 ORDER BY next_allowed_at",[uid,id])]);
  res.set("Cache-Control","private,no-store").json({contact,
   currentStatus:revs.rows[0]||null,previousStatuses:revs.rows.slice(1),
   rules:rules.rows,allPreviousStatusesPreserved:true,unreportedIsNotNoAnswer:true});
 }catch(e){next(e);}
});
router.get("/askanus/max/contacts/:id/calls",requireAuth,async(req,res,next)=>{
 try{
  const uid=getSessionUserId(req)!,id=Number(req.params.id);
  if(!idOk(id)||!await own(uid,id)){res.sendStatus(404);return;}
  const q=await pool.query(
   "SELECT id,number_e164,direction,status,provider,case_id,outcome,mood,note,report_details,"+
   "created_at,started_at,answered_at,ended_at,duration_seconds "+
   "FROM public.max_call_sessions WHERE user_id=$1 AND contact_id=$2 "+
   "AND history_hidden_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 200",[uid,id]);
  res.set("Cache-Control","private,no-store").json({items:q.rows});
 }catch(e){next(e);}
});
router.post("/askanus/max/contacts",requireAuth,async(req,res,next)=>{
 const uid=getSessionUserId(req)!,p=phone(req.body?.phone),name=clean(req.body?.name,240),
  address=clean(req.body?.address,500);
 if(!p){res.status(400).json({error:"US/Canada phone required; name may be blank"});return;}
 const c=await pool.connect();
 try{
  await c.query("BEGIN");
  await c.query("SELECT pg_advisory_xact_lock(256718,$1)",[uid]);
  const found=await c.query("SELECT id FROM public.communication_contacts WHERE user_id=$1 "+
   "AND hidden_at IS NULL AND right(regexp_replace(phone,'[^0-9]','','g'),10)=$2 ORDER BY id LIMIT 1 FOR UPDATE",
   [uid,p.slice(-10)]);
  const record=found.rowCount?
   (await c.query("UPDATE public.communication_contacts SET name=CASE WHEN name='' THEN $1 ELSE name END,"+
    "postal_address=CASE WHEN postal_address='' THEN $2 ELSE postal_address END,updated_at=now() "+
    "WHERE user_id=$3 AND id=$4 RETURNING id,contact_number,name,phone,postal_address",
    [name,address,uid,found.rows[0].id])).rows[0]:
   (await c.query("INSERT INTO public.communication_contacts(user_id,name,phone,postal_address) "+
    "VALUES($1,$2,$3,$4) RETURNING id,contact_number,name,phone,postal_address",
    [uid,name,p,address])).rows[0];
  await c.query("COMMIT");
  res.status(found.rowCount?200:201).json({saved:true,reused:!!found.rowCount,contact:record});
 }catch(e){await c.query("ROLLBACK").catch(()=>{});next(e);}finally{c.release();}
});
router.patch("/askanus/max/contacts/:id",requireAuth,async(req,res,next)=>{
 try{
  const uid=getSessionUserId(req)!,id=Number(req.params.id);
  if(!idOk(id)||!await own(uid,id)){res.sendStatus(404);return;}
  const allowed:Record<string,string>={name:"name",phone:"phone",address:"postal_address",notes:"notes",
   email:"email",organization:"organization",city:"city",tags:"tags",
   preferredHours:"preferred_hours",relationshipNotes:"relationship_notes"};
  const args:unknown[]=[uid,id],sets:string[]=[];
  for(const [field,col] of Object.entries(allowed)){
   if(req.body?.[field]===undefined)continue;
   let value:unknown=clean(req.body[field],field==="notes"||field==="relationshipNotes"?2000:500);
   if(field==="phone"){value=phone(value);if(!value){res.sendStatus(400);return;}}
   args.push(value);sets.push(col+"=$"+args.length);
  }
  if(req.body?.doNotCall!==undefined){
   if(typeof req.body.doNotCall!=="boolean"||
      !req.body.doNotCall&&req.body.confirm!=="CONFIRM_ALLOW_CALLS"){
    res.status(400).json({error:"Unlocking Do Not Call requires confirmation"});return;
   }
   args.push(req.body.doNotCall);sets.push("do_not_call=$"+args.length);
  }
  if(!sets.length){res.status(400).json({error:"No fields selected"});return;}
  const q=await pool.query("UPDATE public.communication_contacts SET "+sets.join(",")+",updated_at=now() "+
   "WHERE user_id=$1 AND id=$2 AND hidden_at IS NULL RETURNING id,contact_number,name,phone,postal_address,do_not_call",args);
  res.json({saved:!!q.rowCount,contact:q.rows[0]||null});
 }catch(e){next(e);}
});
router.delete("/askanus/max/contacts/:id",requireAuth,async(req,res,next)=>{
 try{
  const uid=getSessionUserId(req)!,id=Number(req.params.id);
  if(!idOk(id)||req.body?.confirm!=="HIDE_THIS_CONTACT_ONLY"){
   res.status(400).json({error:"Contact-only confirmation required"});return;
  }
  const r=await pool.query("UPDATE public.communication_contacts "+
   "SET hidden_at=now(),updated_at=now() WHERE user_id=$1 AND id=$2 AND hidden_at IS NULL RETURNING id",[uid,id]);
  res.status(r.rowCount?200:404).json({hidden:!!r.rowCount,
   financialRecordsPreserved:true,callHistoryPreserved:true});
 }catch(e){next(e);}
});
router.put("/askanus/max/contacts/:id/recontact",requireAuth,async(req,res,next)=>{
 try{
  const uid=getSessionUserId(req)!,id=Number(req.params.id);
  if(!idOk(id)||!await own(uid,id)){res.sendStatus(404);return;}
  const scope=clean(req.body?.scopeType,20),scopeId=clean(req.body?.scopeId,80);
  const months=req.body?.intervalMonths==null?null:Number(req.body.intervalMonths);
  const when=new Date(req.body?.nextAllowedAt);
  if(!["person","case","campaign","project"].includes(scope)||
   (scope==="person"&&scopeId!=="")||(scope!=="person"&&!scopeId)||
   (months!==null&&(!Number.isSafeInteger(months)||months<1||months>120))||
   !Number.isFinite(when.getTime())){
   res.status(400).json({error:"Invalid recontact schedule or scope"});return;
  }
  if(scope==="case"&&(!idOk(scopeId)||!(
    await pool.query("SELECT 1 FROM public.askanus_cases WHERE user_id=$1 AND id=$2",[uid,scopeId])
   ).rowCount)){res.sendStatus(404);return;}
  if(scope==="campaign"||scope==="project"){
   res.status(409).json({error:"Campaign/project ownership verification must be connected before saving"});return;
  }
  const q=await pool.query(
   "INSERT INTO public.max_contact_recontact_rules(user_id,contact_id,scope_type,scope_id,interval_months,next_allowed_at) "+
   "VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id,contact_id,scope_type,scope_id) DO UPDATE SET "+
   "interval_months=EXCLUDED.interval_months,next_allowed_at=EXCLUDED.next_allowed_at,updated_at=now() "+
   "RETURNING scope_type,scope_id,interval_months,next_allowed_at",
   [uid,id,scope,scopeId,months,when.toISOString()]);
  res.json({saved:true,rule:q.rows[0],automaticDial:false});
 }catch(e){next(e);}
});
export default router;